#!/usr/bin/env python3
"""PRについたレビューコメントのスレッドを取り出す。

REST API では「そのスレッドが解決済みかどうか」がわからないので GraphQL を使う。
返信に必要な reply_to_id（スレッド先頭コメントのID）と、
スレッドを解決するのに必要な thread_id の両方をここで揃える。

使い方:
    python3 fetch_threads.py 123                # 未解決スレッドだけ
    python3 fetch_threads.py 123 --all          # 解決済みも含める
    python3 fetch_threads.py 123 --json         # 生のJSONで出す
"""

import argparse
import json
import subprocess
import sys

QUERY = """
query($owner:String!, $name:String!, $number:Int!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reviewThreads(first:50, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first:50) {
            nodes {
              databaseId
              body
              createdAt
              author { login }
            }
          }
        }
      }
    }
  }
}
"""


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        sys.exit(proc.returncode)
    return proc.stdout


def resolve_repo(repo_arg):
    if repo_arg:
        return repo_arg
    return json.loads(run(["gh", "repo", "view", "--json", "nameWithOwner"]))["nameWithOwner"]


def resolve_pr(pr_arg, repo):
    if pr_arg:
        return int(pr_arg)
    return json.loads(run(["gh", "pr", "view", "--repo", repo, "--json", "number"]))["number"]


def fetch(owner, name, number):
    threads = []
    cursor = None
    while True:
        cmd = ["gh", "api", "graphql",
               "-f", "query=" + QUERY,
               "-F", "owner=" + owner,
               "-F", "name=" + name,
               "-F", "number=%d" % number]
        if cursor:
            cmd += ["-F", "cursor=" + cursor]
        data = json.loads(run(cmd))
        block = data["data"]["repository"]["pullRequest"]["reviewThreads"]
        threads.extend(block["nodes"])
        if not block["pageInfo"]["hasNextPage"]:
            break
        cursor = block["pageInfo"]["endCursor"]
    return threads


def shape(thread):
    comments = thread["comments"]["nodes"]
    first = comments[0] if comments else {}
    return {
        "thread_id": thread["id"],
        "reply_to_id": first.get("databaseId"),
        "resolved": thread["isResolved"],
        "outdated": thread["isOutdated"],
        "path": thread["path"],
        "line": thread["line"] if thread["line"] is not None else thread["originalLine"],
        "comments": [
            {
                "author": (c.get("author") or {}).get("login", "(unknown)"),
                "created_at": c["createdAt"],
                "body": c["body"],
            }
            for c in comments
        ],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pr", nargs="?", help="PR番号（省略時は今のブランチのPR）")
    ap.add_argument("--repo", help="owner/name（省略時はカレントのリポジトリ）")
    ap.add_argument("--all", action="store_true", help="解決済みスレッドも出す")
    ap.add_argument("--json", action="store_true", help="JSONで出す")
    args = ap.parse_args()

    repo = resolve_repo(args.repo)
    number = resolve_pr(args.pr, repo)
    owner, name = repo.split("/", 1)

    threads = [shape(t) for t in fetch(owner, name, number)]
    if not args.all:
        threads = [t for t in threads if not t["resolved"]]

    if args.json:
        json.dump(threads, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return

    if not threads:
        print("対象のスレッドはなし。")
        return

    print("%s#%d — スレッド %d件\n" % (repo, number, len(threads)))
    for t in threads:
        flags = []
        if t["resolved"]:
            flags.append("解決済み")
        if t["outdated"]:
            flags.append("outdated(その後コードが変わっている)")
        head = "%s:%s" % (t["path"], t["line"])
        print("── %s %s" % (head, ("[" + " / ".join(flags) + "]") if flags else ""))
        print("   thread_id=%s  reply_to_id=%s" % (t["thread_id"], t["reply_to_id"]))
        for c in t["comments"]:
            body = c["body"].strip().replace("\n", "\n     ")
            print("   @%s: %s" % (c["author"], body))
        print()


if __name__ == "__main__":
    main()
