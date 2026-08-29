# このリポジトリについて

GitHubプロフィール用リポジトリ（`kotaroyatabe0235/kotaroyatabe0235`）。
ルートの `README.md` がGitHubプロフィールページに表示される。

## 構成

- `README.md` — プロフィールページ本体
- `kakeibo-app/` — 個人開発プロジェクト（家計簿アプリ、Next.js）。詳細は `kakeibo-app/CLAUDE.md` を参照

新しい個人開発プロジェクトを追加する場合は、サブディレクトリとして配置する。

## 注意事項

- `data/`、`node_modules/`、`.next/` などのビルド成果物・データファイルはコミットしない
- 各サブプロジェクトの `.gitignore` に従う

## Gitワークフロー

- `main` への直接コミットは禁止。GitHub Flow に準じ、トランクベース開発を試行する
- 変更はブランチを切ってコミットし、`main` へはPR経由でマージする
