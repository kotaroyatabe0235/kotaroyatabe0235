# 家計簿（Cloudflare Workers版）

Claude.aiのアーティファクト環境で作られた家計簿アプリを、Cloudflare Workers上で動くように移植したものです。

構成の詳細は [docs/deployment-architecture.md](./docs/deployment-architecture.md) を参照してください。

## 元アーティファクトとの違い

- `window.storage` への依存を廃止し、Next.js の Route Handler (`app/api/kv/[key]/route.js`) 経由で Cloudflare D1 に保存するようにしました。
- レシート撮影によるOCR自動入力機能（Anthropic APIへの画像送信）は削除しました。外部APIキーなしで完全にオフラインで動作します。金額・カテゴリ・日付などはすべて手入力です。
- それ以外の機能（支出/収入の記録、カテゴリ管理、予算・目標設定、集計、月次推移グラフ、JSONエクスポート/インポート）は元のまま維持しています。

## セットアップ

```bash
npm install
```

## 開発サーバー

DB(D1)を使う機能を試すには `vinext` 経由の開発サーバーを使ってください（`npm run dev` は画面確認のみで、`/api/kv` はCloudflareバインディングがないため動作しません）。

```bash
npm run dev:vinext
```

初回はローカルD1にマイグレーションを適用してください。

```bash
npx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json
```

[http://localhost:3001](http://localhost:3001) を開いてください（ビルド済みWorkerを試す場合は `npm run build:vinext && npm run start:vinext` で [http://localhost:8787](http://localhost:8787)）。

## デプロイ（Cloudflare Workers）

初回のみ、Cloudflareアカウントへのログインと実リソースの作成が必要です。

```bash
npx wrangler login
npx wrangler kv namespace create VINEXT_KV_CACHE
npx wrangler d1 create kakeibo-app-db
```

それぞれのコマンドが返す `id` / `database_id` を `wrangler.jsonc` の該当箇所（`<your-kv-namespace-id>` / `<your-d1-database-id>`）に書き込んでから、リモートD1にマイグレーションを適用してデプロイします。

```bash
npx wrangler d1 migrations apply DB --remote
npm run deploy:vinext
```

## 認証・公開について

このアプリ自体には認証機能がありません。外部公開する場合は [docs/deployment-architecture.md](./docs/deployment-architecture.md) の通り、Cloudflare Access（Zero Trust）をアプリの手前に設定して未認可アクセスを防いでください。
