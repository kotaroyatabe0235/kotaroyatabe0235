# pr-review-kit

GitHub の Pull Request をレビューし、その指摘に対応するための Claude Code スキル2本。

| スキル | 何をするか | 呼び方の例 |
| --- | --- | --- |
| `pr-review` | PRを読んでレビューし、日本語のインラインコメントを投稿する | 「このPRをレビューして」 |
| `pr-respond` | ついたレビューコメントに対応する（直す→返信→解決） | 「レビューコメントに対応して」 |

どちらも **投稿・push の前に必ず確認をとる**。勝手に GitHub へ書きこまない。

## 必要なもの

- `gh`（GitHub CLI）でログイン済みであること（`gh auth status`）
- Python 3（macOS 標準のものでよい）

追加のインストールは不要。

## セットアップ

`~/.claude/skills/` にシンボリックリンクを張る。

```bash
ln -s ~/workspaces/kotaroyatabe0235/pr-review-kit/pr-review  ~/.claude/skills/pr-review
ln -s ~/workspaces/kotaroyatabe0235/pr-review-kit/pr-respond ~/.claude/skills/pr-respond
```

## scripts を直接使う

```bash
cd pr-review-kit/scripts

# どの行にインラインコメントを付けられるか調べる
gh pr diff 12 | python3 diff_lines.py

# レビューを投稿する（--dry-run で行番号の検算だけできる）
python3 post_review.py 12 --file review.json --dry-run
python3 post_review.py 12 --file review.json

# 未解決のレビュースレッドを見る
python3 fetch_threads.py 12
```

`--repo owner/name` を付ければ別のリポジトリにも使える。
