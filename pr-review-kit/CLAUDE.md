# pr-review-kit について

GitHub の Pull Request をレビューし、その指摘に対応するための Claude Code スキル2本。

## 構成

- `pr-review/SKILL.md` — PRを読んでレビューし、日本語のインラインコメントを投稿する
- `pr-respond/SKILL.md` — ついたレビューコメントに対応する（直す→返信→解決）
- `scripts/` — 2つのスキルが共有するヘルパー

## scripts の役割

- `diff_lines.py` — unified diff を読んで「インラインコメントを付けられる行」を出す。
  GitHub は diff のハンクの中の行にしかコメントできず、外すと 422 になるため。
- `post_review.py` — `diff_lines.py` で検算してから、1つのレビューとしてまとめて投稿する。
  検算に落ちたら何も投稿しない（部分的に投稿されると直しづらいので）。
- `fetch_threads.py` — レビュースレッドを GraphQL で取る。
  REST では「解決済みか」がわからないので GraphQL を使っている。

依存パッケージはなし。macOS 標準の Python 3.9 と `gh` コマンドだけで動く。

## スキルの登録

`~/.claude/skills/` からシンボリックリンクを張っている。

```bash
ln -s ~/workspaces/kotaroyatabe0235/pr-review-kit/pr-review  ~/.claude/skills/pr-review
ln -s ~/workspaces/kotaroyatabe0235/pr-review-kit/pr-respond ~/.claude/skills/pr-respond
```

## 決めごと

- コメント・返信はすべて **日本語**。
- **投稿・push の前に必ずユーザーの確認をとる。** 勝手に投稿しない。
- レビューの `event` は既定で `COMMENT`。`APPROVE` / `REQUEST_CHANGES` は明示的に頼まれたときだけ。
