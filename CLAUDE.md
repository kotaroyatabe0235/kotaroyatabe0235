# このリポジトリについて

GitHubプロフィール用リポジトリ（`kotaroyatabe0235/kotaroyatabe0235`）。
ルートの `README.md` がGitHubプロフィールページに表示される。

## 構成

- `README.md` — プロフィールページ本体
- `kakeibo-app/` — 個人開発プロジェクト（家計簿アプリ、Next.js）。詳細は `kakeibo-app/CLAUDE.md` を参照
- `note-publisher/` — note(note.com)の下書きを作る Claude Code スキル
- `pdu-claimer/` — 公開したnote記事をPMPのPDUとして申請する Claude Code スキル
- `pr-review-kit/` — PRのレビューと、レビューコメントへの対応をする Claude Code スキル2本

## 作業場所のルール

新しいプロジェクト（個人開発・学習用を問わず）は、**このリポジトリ配下にサブディレクトリを作成して**進める。
`~/analysis` のようにホーム直下や `~/workspaces` 直下へ独立したディレクトリを作らないこと。

各サブプロジェクトには、そのプロジェクト固有の文脈を書いた `CLAUDE.md` を配置する。

## 注意事項

- `data/`、`node_modules/`、`.next/` などのビルド成果物・データファイルはコミットしない
- 各サブプロジェクトの `.gitignore` に従う

## Gitワークフロー

- `main` への直接コミットは禁止。GitHub Flow に準じ、トランクベース開発を試行する
- 変更はブランチを切ってコミットし、`main` へはPR経由でマージする
