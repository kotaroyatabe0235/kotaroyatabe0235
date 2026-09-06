#!/usr/bin/env python3
"""レビューコメントを1つのレビューとしてPRに投稿する。

投稿する前に、各コメントの path / line が本当に diff の中にあるかを検算する。
ここで弾いておかないと GitHub API が 422 を返して、どのコメントが悪いのか
わからないまま全部が投稿されずに終わる。

入力JSONの形:
    {
      "body": "レビュー全体のまとめ",
      "event": "COMMENT",
      "comments": [
        {"path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "..."},
        {"path": "src/bar.ts", "start_line": 10, "line": 14, "body": "..."}
      ]
    }

使い方:
    python3 post_review.py 123 --file review.json --dry-run
    python3 post_review.py 123 --file review.json
"""

import argparse
import json
import subprocess
import sys

import diff_lines

VALID_EVENTS = ("COMMENT", "APPROVE", "REQUEST_CHANGES")


def run(cmd, stdin_text=None):
    proc = subprocess.run(cmd, input=stdin_text, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        sys.exit(proc.returncode)
    return proc.stdout


def resolve_repo(repo_arg):
    if repo_arg:
        return repo_arg
    out = run(["gh", "repo", "view", "--json", "nameWithOwner"])
    return json.loads(out)["nameWithOwner"]


def resolve_pr(pr_arg, repo):
    if pr_arg:
        return str(pr_arg)
    out = run(["gh", "pr", "view", "--repo", repo, "--json", "number"])
    return str(json.loads(out)["number"])


def validate(review, allowed):
    """コメントの位置が diff の中にあるか確かめ、問題のリストを返す。"""
    problems = []

    event = review.get("event", "COMMENT")
    if event not in VALID_EVENTS:
        problems.append("event は %s のどれかにする（今: %r）"
                        % ("/".join(VALID_EVENTS), event))

    for i, c in enumerate(review.get("comments", [])):
        label = "comments[%d]" % i
        path = c.get("path")
        line = c.get("line")

        if not path:
            problems.append("%s: path がない" % label)
            continue
        if not isinstance(line, int):
            problems.append("%s (%s): line が整数でない" % (label, path))
            continue
        if not c.get("body", "").strip():
            problems.append("%s (%s:%s): body が空" % (label, path, line))

        side = c.get("side", "RIGHT")
        if side not in ("RIGHT", "LEFT"):
            problems.append("%s: side は RIGHT か LEFT（今: %r）" % (label, side))
            continue

        if path not in allowed:
            problems.append(
                "%s: %s はこのPRの diff に入っていない" % (label, path))
            continue

        ranges = allowed[path].get(side, [])
        if not any(lo <= line <= hi for lo, hi in ranges):
            problems.append(
                "%s: %s の %s 行目(%s)は diff の外。コメントできるのは %s"
                % (label, path, line, side, ranges or "なし"))
            continue

        start = c.get("start_line")
        if start is not None:
            if not isinstance(start, int) or start > line:
                problems.append(
                    "%s: start_line は line 以下の整数にする" % label)
            elif not any(lo <= start <= hi for lo, hi in ranges):
                problems.append(
                    "%s: %s の start_line %s は diff の外" % (label, path, start))

    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pr", nargs="?", help="PR番号（省略時は今のブランチのPR）")
    ap.add_argument("--repo", help="owner/name（省略時はカレントのリポジトリ）")
    ap.add_argument("--file", required=True, help="レビュー内容のJSONファイル")
    ap.add_argument("--dry-run", action="store_true",
                    help="検算だけして投稿しない")
    args = ap.parse_args()

    with open(args.file, encoding="utf-8") as f:
        review = json.load(f)

    repo = resolve_repo(args.repo)
    pr = resolve_pr(args.pr, repo)

    diff_text = run(["gh", "pr", "diff", pr, "--repo", repo])
    allowed = {p: s for p, s in diff_lines.parse(diff_text).items()}
    allowed = {p: {side: diff_lines.to_ranges([n for n, _ in items])
                   for side, items in sides.items() if items}
               for p, sides in allowed.items()}

    problems = validate(review, allowed)
    if problems:
        sys.stderr.write("投稿を中止した。直すところ:\n")
        for p in problems:
            sys.stderr.write("  - %s\n" % p)
        sys.exit(1)

    n = len(review.get("comments", []))
    if args.dry_run:
        print("OK: %s#%s に インラインコメント %d件 を投稿できる（dry-run）"
              % (repo, pr, n))
        return

    payload = json.dumps(review, ensure_ascii=False)
    out = run(["gh", "api", "--method", "POST",
               "repos/%s/pulls/%s/reviews" % (repo, pr),
               "--input", "-"], stdin_text=payload)
    result = json.loads(out)
    print("投稿した: %s（インラインコメント %d件）"
          % (result.get("html_url", "URL不明"), n))


if __name__ == "__main__":
    main()
