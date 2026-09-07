---
name: pdu-claim
description: 公開したnote記事を、PMPのPDU（Giving Back / Create Content）として申請するための内容を組み立て、台帳に記録する。「この記事をPDUにして」「PDU申請の内容を作って」といった依頼で使う。CCRSへの送信は、ユーザーが明示的に頼んだときだけ行う。
---

# pdu-claim

公開済みの note 記事から、PMPのPDU申請に書く内容を組み立てるスキル。

## 前提

- 記事の執筆は **Giving Back / Create Content**。**実際にかけた時間で 1時間 = 1PDU**。
- PMPは3年サイクルで60PDU、うち Giving Back は最大25PDU。
- **PDU申請はPMIの監査対象。時間を盛らない。** 時間が分からないときはユーザーに聞く。
  勝手に多めの既定値を入れない（既定は `src/claim.mjs` の `DEFAULT_HOURS` = 2時間）。
- CCRSにも公式APIは無い。送信まで自動化する場合はブラウザ操作になり、
  PMIの利用規約上グレーであることをユーザーは了解済み。

## 場所

`~/workspaces/kotaroyatabe0235/pdu-claimer/`

## 手順

### 1. 申請内容を組み立てる（PMIにはつながない）

```bash
node src/cli.mjs prepare <note記事のURL> [--hours 3]
```

- 記事の情報は note の公開窓口（`/api/v3/notes/<記事キー>`）から取る。ログイン不要
- 下書きの記事は 404 になる。公開されているか先に確かめる
- すでに台帳にある記事なら警告を出す（二重申請の防止）

### 2. 台帳を見る

```bash
node src/cli.mjs list
```

台帳は `.data/claims.json`。**コミットしない**（個人の資格の記録）。
ここに出るのはこのツールで申請した分だけで、CCRSの画面で直接申請した分は入らない。

### 3. 申請する（ユーザーが明示的に頼んだときだけ）

```bash
node src/cli.mjs submit <note記事のURL> --hours 2 [--dry-run] [--yes]
```

- 区分は **Giving Back / Create Content** 固定（`/claim/new/CreateContent`）
- フォームに入れた中身を読み返して見せてから、`agree <PDU数>` の打ち込みで確認する
- `--yes` を使ってよいのは、その会話でユーザーが「この記事を申請して」と
  名指しで頼み、**PDU数（＝実際にかけた時間）も本人が言ったとき**だけ
- 台帳にある記事は二重申請になるので止まる
- CCRSの注意書き（「PDUクレームコードがあるのでは？」など）が出たら、
  そのままユーザーに伝える。勝手に無視しない

### 4. 今の状態を見る

```bash
node src/cli.mjs status
```

残りPDU、区分ごとの内訳、最低ライン（各8PDU）に届いていない区分を表示する。
記事（Giving Back）では Education の不足は埋められない点に注意。

### 5. PMIにログインする

```bash
node src/cli.mjs login --headless
```

ユーザー名とパスワードをターミナルで聞く。**この操作はユーザー自身にやってもらう**
（コマンドは `!` を付けずに、ターミナルに貼る形で渡す）。
多要素認証が出た場合はその場で聞き返す。

## 注意

- `.browser-profile/` にはPMIのログイン情報が入る。**絶対にコミットしない**。
- このリポジトリはGitHubで公開されている。台帳・ログイン状態を出さないよう
  `.gitignore` を必ず確認する。
- 時間（PDU数）はユーザーの申告がすべて。推測で埋めない。
