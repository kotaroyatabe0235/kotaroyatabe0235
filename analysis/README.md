# git-log-analysis

Gitリポジトリのコミット履歴を題材に、pandasの基本操作と
統計の基礎(平均・中央値・外れ値・集計)を学ぶための学習用プロジェクトです。

Java/SQLでの開発経験はあるがPython/pandasは初学者、という人が
「実データを触りながら手を動かして覚える」ことを想定しています。

## 分析対象

[spring-projects/spring-boot](https://github.com/spring-projects/spring-boot) のコミット履歴。
Javaのリポジトリなので、Java経験者にとって中身がイメージしやすいという理由で選んでいます。

## 構成

```
analysis/
├── README.md
├── requirements.txt      # 必要なPythonパッケージ (pandas, ipython)
├── .gitignore
├── scripts/
│   ├── 01_export_log_basic.sh    # git log -> commits_basic.csv (hash, date, author)
│   ├── 02_export_log_numstat.sh  # git log --numstat -> 生ログ(.txt)
│   ├── 03_parse_numstat.py       # 生ログ -> tidyなCSV (1行=1コミット×1ファイル)
│   └── 04_analyze.py             # pandasによる分析の雛形
├── repos/                # 分析対象リポジトリをcloneする場所 (Gitには含めない)
└── data/                 # 生成したCSV/ログの置き場所 (Gitには含めない)
```

`data/` と `repos/` は `.gitignore` で除外しており、リポジトリには
**コードとREADMEだけ** が残るようにしています。実データはスクリプトを
実行すればいつでも再生成できます。

## セットアップ

macOS (Apple Silicon) + ターミナルのみを想定しています。Jupyterは使わず、
スクリプトと `ipython` で進めます。

### 1. Python仮想環境(venv)を作る

```bash
cd ~/analysis
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

以降、このプロジェクトで作業するときは毎回 `source .venv/bin/activate` を実行してください。
(抜けるときは `deactivate`)

### 2. 分析対象リポジトリをclone

```bash
git clone --filter=blob:none https://github.com/spring-projects/spring-boot.git repos/spring-boot
```

`--filter=blob:none` は「ファイルの中身(blob)を最初はダウンロードせず、
コミット履歴のメタデータだけを先に持ってくる」ためのオプションです。
コミットハッシュ・日付・作者・差分行数(numstat)といった、
このプロジェクトで使う情報だけならこれで十分で、フルcloneよりもずっと軽量です。

## 実行手順

すべて `~/analysis` をカレントディレクトリとして、venvを有効化した状態で実行してください。

```bash
source .venv/bin/activate

# 1. 基本情報(hash, date, author)をCSVに書き出す
./scripts/01_export_log_basic.sh
# -> data/commits_basic.csv ができる

# 2. --numstat付きの生ログを書き出す(デフォルトは直近1500コミット)
./scripts/02_export_log_numstat.sh
# -> data/commits_numstat_raw.txt ができる

# 3. 生ログをtidyなCSVに変換する(Python)
python scripts/03_parse_numstat.py
# -> data/commits_numstat_tidy.csv ができる
#    (列: hash, date, author, added, deleted, filename)

# 4. pandasで分析する(雛形)
python scripts/04_analyze.py
```

各スクリプトは引数なしでも動きますが、対象リポジトリや出力先を変えたい場合は
引数で指定できます(スクリプト冒頭のコメント参照)。

### ipythonで対話的に触ってみる

`04_analyze.py` を実行するだけでなく、ipython上で1行ずつ試すと理解が進みます。

```bash
source .venv/bin/activate
ipython
```

```python
import pandas as pd
df = pd.read_csv("data/commits_numstat_tidy.csv", parse_dates=["date"])
df.head()
df.describe()
df.groupby("author")["added"].sum().sort_values(ascending=False).head(10)
```

## データの列について

### data/commits_basic.csv

| 列名   | 内容                         |
|--------|------------------------------|
| hash   | コミットハッシュ             |
| date   | コミット日時 (ISO 8601形式)  |
| author | 作者名                       |

### data/commits_numstat_tidy.csv

1行が「あるコミットの、ある1ファイルへの変更」を表す、tidyな(縦持ちの)データです。

| 列名     | 内容                                             |
|----------|--------------------------------------------------|
| hash     | コミットハッシュ                                 |
| date     | コミット日時                                     |
| author   | 作者名                                           |
| added    | そのファイルへの追加行数(バイナリファイルは空)  |
| deleted  | そのファイルからの削除行数(バイナリファイルは空)|
| filename | 変更されたファイルのパス                         |

## なぜ `--numstat` は「直近N件」に絞っているか

`01_export_log_basic.sh` はコミットのメタデータ(hash/date/author)だけを見るので、
`--filter=blob:none` でcloneした直後でも全履歴(spring-bootは6万件超)を
数十秒で処理できます。

一方 `02_export_log_numstat.sh` の `--numstat` は「追加/削除行数」を出すために
ファイルの中身の差分を計算する必要があり、blob:noneでcloneした直後は
手元にファイルの中身(blob)が無いため、コミットごとにGitHubへ
都度ダウンロードしにいく(遅延フェッチする)動きになります。
実測で1コミットあたり0.3秒前後かかるため、全履歴を対象にすると
数時間かかってしまいます。

学習目的では直近1500件程度でも平均・中央値・外れ値・集計といった
統計操作は十分に体感できるため、デフォルトでは直近1500件に絞っています。
もっと多くのデータで試したい場合は
`./scripts/02_export_log_numstat.sh repos/spring-boot data/commits_numstat_raw.txt 5000`
のように第3引数でコミット数を増やせます(その分、初回実行時間は伸びます)。

## なぜ生ログとtidy CSVを分けているか

`git log --numstat` の生の出力は、1コミットにつき

```
コミット情報の行
追加行数<TAB>削除行数<TAB>ファイル名 (ファイルの数だけ続く)
```

という「1コミット = 複数行」の形をしています。これはそのままでは
pandasで扱いにくい(1行1レコードになっていない)ため、
`03_parse_numstat.py` で「1行 = 1コミット×1ファイル」のtidyな形に
変換しています。この「縦持ちに整形してから集計する」という考え方は、
pandasに限らず表計算・SQL・BIツールなど広く使う基本パターンです。
