# 家計簿（セルフホスト版）

Claude.aiのアーティファクト環境で作られた家計簿アプリを、自前のサーバーだけで動くように移植したものです。

## 元アーティファクトとの違い

- `window.storage` への依存を廃止し、Next.js の Route Handler (`app/api/kv/[key]/route.js`) 経由で SQLite（Node組み込みの `node:sqlite`）に保存するようにしました。外部サービスやDBサーバーは不要です。
- レシート撮影によるOCR自動入力機能（Anthropic APIへの画像送信）は削除しました。外部APIキーなしで完全にオフラインで動作します。金額・カテゴリ・日付などはすべて手入力です。
- それ以外の機能（支出/収入の記録、カテゴリ管理、予算・目標設定、集計、月次推移グラフ、JSONエクスポート/インポート）は元のまま維持しています。

## セットアップ

```bash
npm install
```

## 開発サーバー

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。

## 本番運用

```bash
npm run build
npm run start
```

デフォルトではポート3000で起動します。`PORT=8080 npm run start` のように環境変数で変更できます。

## データの保存場所

SQLiteファイルは `data/kakeibo.db` に作成されます（初回アクセス時に自動生成）。このディレクトリをバックアップすれば、記録・予算・カテゴリすべてが保持されます。保存場所を変えたい場合は環境変数 `KAKEIBO_DB_PATH` にファイルパスを指定してください。

```bash
KAKEIBO_DB_PATH=/var/lib/kakeibo/kakeibo.db npm run start
```

## 常駐させる場合

`pm2` や `systemd` などで `npm run start` を管理するか、リバースプロキシ（nginx/Caddy）経由で公開してください。このアプリ自体には認証機能がないため、家族以外からアクセスできない環境（自宅LAN内、VPN経由、Basic認証をリバースプロキシに追加、など）で運用することを推奨します。
