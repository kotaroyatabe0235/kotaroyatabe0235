# note-publisher

Markdownファイルを渡すと、note(note.com)の**下書き**を作ったり書きかえたりするツール。
Claude Code の Skill としても使えます。

## だいじな前提

- noteには「外から記事を投稿する公式の窓口(API)」が**ありません**。
  なので、Playwrightで本物のブラウザを裏で動かして、人と同じ操作をしています。
- **公開ボタンは押しません。** 下書き保存までで止まります。
  内容を自分の目で確かめてから、noteの画面で「公開」を押してください。
- noteの規約には「運営に支障が生じると判断した場合」利用を止められる条文があります
  (クリエイター規約 10.1.8)。自動化はグレーゾーンです。
  短い時間に何度も実行しないでください(目安: 10回/分より少なく)。

## 準備

### 1. ライブラリを入れる

```bash
cd ~/workspaces/kotaroyatabe0235/note-publisher
npm install
```

### 2. 最初に1回だけログインする

```bash
node src/cli.mjs login
```

ブラウザが開きます。**自分の手で**noteにログインしてください。
終わったらターミナルに戻って Enter を押します。

ログインした状態は `.browser-profile/` というフォルダに残るので、次回からは不要です。

> `.browser-profile/` にはログイン情報(Cookie)が入っています。
> `.gitignore` で除外していますが、**絶対に他人に渡さないでください**。

## つかいかた

### 新しい下書きを作る

```bash
node src/cli.mjs draft ~/memo/kiji.md
```

Markdownの一番最初の `# 見出し` が、そのまま記事のタイトルになります。

### すでにある記事を書きかえる

```bash
node src/cli.mjs draft ~/memo/kiji.md --url https://note.com/ユーザー名/n/nXXXXXXXX
```

### オプション

| オプション | いみ |
|---|---|
| `--title "タイトル"` | Markdownの見出しではなく、これをタイトルにする |
| `--headless` | ブラウザの画面を出さずに裏で動かす |

## うまく動かないとき

noteの画面の作りが変わると、部品を見つけられなくなることがあります。
そのときはこれを実行してください。

```bash
node src/cli.mjs probe
```

今の画面にある入力欄やボタンの一覧が出ます。
その内容をClaudeに見せると、`src/note.mjs` の目印(セレクタ)を直せます。

## 仕組み

```
Markdownファイル
  ↓ marked で変換
HTML
  ↓ 「貼り付け」の出来事として流し込む
noteのエディタ(ProseMirror)
  ↓ noteが自分で見出し・太字・リストに変換してくれる
下書き完成
```

1文字ずつ打ち込むのではなく「HTMLを貼り付けた」ことにするのがポイントです。
こうすると、note独自の内部フォーマットを自分で組み立てなくて済みます。

## ファイル構成

```
note-publisher/
├── SKILL.md          # Claude Code の Skill 定義
├── README.md
├── package.json
├── .gitignore
└── src/
    ├── cli.mjs       # 入口。コマンドの受付
    ├── markdown.mjs  # Markdown → HTML の変換
    └── note.mjs      # ブラウザ操作
```

## できないこと

- 画像の埋め込み
- 有料記事の設定
- ハッシュタグの自動付与
