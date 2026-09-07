# pdu-claimer

公開した note の記事を、**PMPのPDU**（資格を保つために必要な学習の点数）として
申請するための道具。Claude Code の Skill としても使えます。

## だいじな前提

- 記事を書くのは、PDUの区分では **Giving Back の Create Content**（コンテンツを作る）に
  あたります。数えかたは **実際にかけた時間で 1時間 = 1PDU**。
- PMPは3年で **60PDU** 必要で、そのうち Giving Back で数えられるのは **最大25PDU** です。
- **PDUの申請はPMIの監査（本当にやったかの確認）の対象です。**
  時間は盛らずに、実際にかけた時間を入れてください。
- CCRS（PDUを申請するサイト）にも外から申請する公式の窓口(API)はありません。
  `submit` を作る場合は、noteと同じくブラウザを裏で動かすことになります。
  PMIの利用規約は自動での接続を想定していないので、グレーゾーンです。

## つかいかた

### 1. 申請に書く内容を組み立てる（PMIにはつながない）

```bash
node src/cli.mjs prepare https://note.com/ユーザー名/n/nXXXXXXXX
```

こう出ます。

```
CCRSの入力欄に、これをそのまま入れてください。

  Category            : Giving Back — Create Content
  Title               : ボトムアップ見積もりの実践方法と考え方
  Description         : Wrote and published a project management article on note.com …
  Date Started        : 2026-05-09
  Date Completed      : 2026-05-09
  PDUs Claimed        : 2
  Talent Triangle     : Ways of Working
  URL                 : https://note.com/kota0235/n/nc94119131178
```

時間を変えるときは `--hours 3` のように指定します。

記事の情報（タイトル・公開日・文字数）は、noteが公開している窓口から取ってきます。
ログインは要りません。

### 2. PMIにログインする（送信まで自動にする場合）

```bash
node src/cli.mjs login --headless
```

ユーザー名とパスワードをターミナルで聞きます。パスワードは画面に出ず、
ファイルにも保存しません。残るのは `.browser-profile/` のログイン状態だけです。

多要素認証（スマホに届く確認コードなど）が出た場合は、その場で聞き返します。

### 3. 申請する（CCRSに送信する）

```bash
node src/cli.mjs submit https://note.com/ユーザー名/n/nXXXXXXXX --hours 2
```

フォームに入れた中身を読み返して見せたあと、こう聞かれます。

```
PMIの画面にはこう書かれています:
  「誤った申請は、資格の停止や取り消しにつながることがあります」

申請する時間は 2 時間（2 PDU）です。
これが実際にかけた時間として正しいなら、
「agree 2」と打ってください。（やめる場合はそのまま Enter）
>
```

`agree <PDU数>` と打つまで送信しません。PDU数を目で読まないと打てない形にしてあります。

`--dry-run` を付けると、フォームに入れるところまでで止まります。

申請できたら台帳に記録します。同じ記事を二度申請しようとすると止まります。

### 4. 今の状態を見る

```bash
node src/cli.mjs status
```

```
PMPの今の状態:
  サイクル          : 8 Jan 2025 - 7 Jan 2028
  更新まで          : 489 日
  残りPDU           : 23.5

  Education（最低35）
    Ways of Working : 16.5 （最低8）
    Power Skills    : 11.25 （最低8）
    Business Acumen : 7.5 （最低8）
  Giving Back（最大25）
    Other Giving Back: 1.25
```

最低ラインに届いていない区分があれば警告します。

### 5. 台帳を見る

```bash
node src/cli.mjs list
```

どの記事を何PDUで申請したかと、Giving Back の残り枠が出ます。
台帳は `.data/claims.json` に置かれ、**コミットされません**（個人の記録なので）。

## ファイル構成

```
pdu-claimer/
├── SKILL.md          # Claude Code の Skill 定義
├── README.md
├── package.json
├── .gitignore
└── src/
    ├── cli.mjs       # 入口。コマンドの受付
    ├── article.mjs   # note の記事情報を取ってくる
    ├── claim.mjs     # 申請に書く内容を組み立てる
    ├── ledger.mjs    # 台帳（.data/claims.json）
    └── ccrs.mjs      # PMI(CCRS)のブラウザ操作
```

## CCRSのフォームで分かったこと

- 申請の区分は **Giving Back の Create Content**。フォームは `/claim/new/CreateContent`
- **タレント・トライアングルの割り振り欄は無い。** Giving Back の数値ひとつだけ
  （`PDUValues[0].GiveBack`）
- Organization は必須。自分で書いて自分で出した記事なので `Self` を入れている
- 日付は `MM/DD/YYYY`
- Description は Kendo UI のリッチテキスト欄で、見えている入力欄は iframe の中にある
- タイトルによっては「この活動はPDUクレームコードがあるのでは？」という
  注意書きが出る。自分で書いた記事にクレームコードは無いので、Create Content のままでよい

## まだ無いもの

- 研修・読書など、記事以外のPDUの申請
- 申請の取り消し（CCRSの画面で行う）
