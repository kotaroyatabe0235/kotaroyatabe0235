# pdu-claimer について

公開した note 記事を、PMPのPDU（Giving Back / Create Content）として
申請するための道具。`note-publisher` の続きにあたる位置づけ。

## この作業で守ること

- **PDU申請はPMIの監査対象。** 申請する時間（PDU数）はユーザーの申告がすべて。
  推測で埋めたり、多めの既定値を勝手に使ったりしない。
- **`.data/`（台帳）と `.browser-profile/`（ログイン状態）は絶対にコミットしない。**
  このリポジトリはGitHubで公開されている。
- CCRSへの送信を作る場合は、note-publisher の `publish` と同じ考え方で、
  送信の一歩手前で必ず止まる作りにする（`--dry-run` と、確認の打ち込み）。

## PDUの決まり（PMP・3年サイクル）

| 区分 | 内容 | 数え方 |
|---|---|---|
| Education | 研修・読書など | 3年で最低35PDU |
| Giving Back — Create Content | 記事・本などを書く | 実際にかけた時間で1時間=1PDU |
| Giving Back 全体 | 発表・執筆・ボランティアなど | 3年で最大25PDU |

合計は3年で60PDU。

## 状態（2026-09-07 時点）

- `prepare` / `list` … 動作確認ずみ
- `login --headless` … 動作確認ずみ。多要素認証は出なかった
- `status` … 動作確認ずみ（CCRSのダッシュボードから実データを読めた）
- `submit` … `--dry-run`（送信の一歩手前）まで確認ずみ。**実際の送信はまだ試していない**

## CCRSのフォームの作り（調査ずみ）

- 申請ページ: `https://ccrs.pmi.org/claim/new/CreateContent`
- 入力欄: `ProviderName` / `ActivityTitle` / `Description` / `URL` /
  `DateStarted` / `DateCompleted`（MM/DD/YYYY）/ `PDUValues[0].GiveBack` /
  `ToggleAccept`（同意のチェック）/ Submit
- **タレント・トライアングルの割り振り欄は無い**（Giving Back の数値ひとつ）
- `Description` と `PDUValues[0].GiveBack` は Kendo UI の部品で、本体の欄は隠れている。
  Description は iframe に打ち込み、PDU数は部品のAPI（kendoNumericTextBox）で入れる
- ログインは `idp.pmi.org`（Username / Password / Log In to PMI）
