#!/usr/bin/env python3
"""unified diff を読んで「インラインコメントを付けられる行」を洗い出す。

GitHub の PR レビューAPIは、diff のハンク（変更のかたまり）に含まれる行にしか
インラインコメントを付けられない。範囲外の行を指定すると 422 で失敗する。
このスクリプトはその「付けられる行」を先に一覧にしておくためのもの。

使い方:
    gh pr diff 123 | python3 diff_lines.py
    gh pr diff 123 | python3 diff_lines.py --lines     # 1行ずつ中身も出す
"""

import argparse
import json
import re
import sys

HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def parse(diff_text):
    """diff を {path: {"RIGHT": [line...], "LEFT": [line...]}} に変換する。"""
    files = {}
    current = None
    old_no = new_no = 0
    in_hunk = False

    for raw in diff_text.splitlines():
        if raw.startswith("diff --git "):
            current = None
            in_hunk = False
            continue

        if raw.startswith("+++ "):
            path = raw[4:].strip()
            if path == "/dev/null":
                current = None
            else:
                # "b/src/foo.ts" の先頭 "b/" を落とす
                current = path[2:] if path.startswith(("a/", "b/")) else path
                files.setdefault(current, {"RIGHT": [], "LEFT": []})
            in_hunk = False
            continue

        if raw.startswith("--- "):
            continue

        m = HUNK_RE.match(raw)
        if m:
            old_no = int(m.group(1))
            new_no = int(m.group(3))
            in_hunk = True
            continue

        if not in_hunk or current is None:
            continue

        if raw.startswith("\\"):  # "\ No newline at end of file"
            continue

        head = raw[0] if raw else " "
        body = raw[1:] if raw else ""

        if head == "+":
            files[current]["RIGHT"].append((new_no, body))
            new_no += 1
        elif head == "-":
            files[current]["LEFT"].append((old_no, body))
            old_no += 1
        elif head == " ":
            files[current]["RIGHT"].append((new_no, body))
            old_no += 1
            new_no += 1
        else:
            # ハンクの外に出た（"diff --git" 以外の区切り行など）
            in_hunk = False

    return files


def to_ranges(numbers):
    """[1,2,3,7,8] -> [[1,3],[7,8]]"""
    ranges = []
    for n in numbers:
        if ranges and n == ranges[-1][1] + 1:
            ranges[-1][1] = n
        else:
            ranges.append([n, n])
    return ranges


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lines", action="store_true",
                    help="行番号だけでなく、その行の中身も出力する")
    args = ap.parse_args()

    files = parse(sys.stdin.read())

    out = {}
    for path, sides in files.items():
        entry = {}
        for side in ("RIGHT", "LEFT"):
            items = sides[side]
            if not items:
                continue
            if args.lines:
                entry[side] = [{"line": n, "text": t} for n, t in items]
            else:
                entry[side] = to_ranges([n for n, _ in items])
        if entry:
            out[path] = entry

    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
