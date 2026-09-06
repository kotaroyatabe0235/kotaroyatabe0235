---
name: note-draft
description: Markdownファイルからnote(note.com)の下書きを作成または更新する。「noteに投稿して」「この記事をnoteの下書きにして」「noteの記事を更新して」といった依頼で使う。安全のため下書き保存までしか行わず、公開はユーザーが手動で行う。
---

# note-draft

Markdownファイルを受け取り、note.com の下書きを作成・更新するスキル。

## 前提

- note には記事投稿の公式APIが**無い**。Playwrightで実ブラウザを操作する。
- ログイン情報はファイルに保存しない。`.browser-profile/` にブラウザのプロフィールを残し、
  ユーザーが一度手動でログインした状態を再利用する。
- **公開ボタンは絶対に押さない。** 下書き保存までで止める。公開はユーザー自身が
  note の画面で内容を確認してから行う。これはユーザーとの合意事項。

## 場所

`~/workspaces/kotaroyatabe0235/note-publisher/`

## 手順

### 1. 初回のみ：セットアップ確認

`node_modules/` が無ければインストールする。

```bash
cd ~/workspaces/kotaroyatabe0235/note-publisher
npm install
```

### 2. 初回のみ：ログイン

`.browser-profile/` が無い、またはログインが切れている場合、ユーザーに手動ログインを依頼する。

```bash
node src/cli.mjs login
```

ブラウザが開くのでユーザーが手でログインし、ターミナルで Enter を押す。
**この操作はユーザー自身にやってもらう**（`!` プレフィックスでの実行を案内するとよい）。

### 3. 下書きを作る／書きかえる

新規作成:

```bash
node src/cli.mjs draft <Markdownファイルのパス>
```

既存記事の書きかえ:

```bash
node src/cli.mjs draft <Markdownファイルのパス> --url https://note.com/<ユーザー名>/n/<記事キー>
```

オプション:

- `--title "タイトル"` — Markdown の先頭 `# 見出し` ではなく、指定した文字列をタイトルにする
- `--headless` — ブラウザの画面を出さずに実行する

### 4. うまく動かないとき

note の画面の作りが変わるとセレクタがずれる。その場合:

```bash
node src/cli.mjs probe
```

を実行して出力された JSON を確認し、`src/note.mjs` の
`TITLE_SELECTORS` / `BODY_SELECTORS` と `saveDraft()` の候補リストを直す。

## 仕様メモ

- Markdown の先頭 `# 見出し` がタイトルになり、本文からは取り除かれる。
- 本文は Markdown → HTML に変換し、`paste` イベントとしてエディタに流し込む。
  note のエディタ（ProseMirror）が自前で見出し・太字・リストに変換してくれるため、
  note 独自の内部フォーマットを手で組み立てる必要がない。
- 画像の埋め込みには未対応。

## 注意

- note の利用規約には「運営に支障が生じると判断した場合」利用停止できる条項がある
  （クリエイター規約 10.1.8）。自動化はグレーゾーンであることをユーザーは了解済み。
- 短時間に何度も実行しない。目安として 10リクエスト/分 を超えない。
- `.browser-profile/` は `.gitignore` 済み。**絶対にコミットしない**（セッションCookieが入っている）。
