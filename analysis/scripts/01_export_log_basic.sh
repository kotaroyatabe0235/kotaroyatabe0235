#!/usr/bin/env bash
#
# git logから「コミットハッシュ, 日付, 作者」だけを取り出してCSVにするスクリプト。
#
# 使い方:
#   ./01_export_log_basic.sh [対象リポジトリのパス] [出力先CSVのパス]
#
# 例(デフォルト値を使う場合。repos/spring-boot -> data/commits_basic.csv):
#   ./01_export_log_basic.sh
#
set -euo pipefail

# $(dirname "$0") は「このスクリプト自身が置かれているディレクトリ」を指す。
# どこから実行してもパスがズレないようにするための定石。
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

REPO_PATH="${1:-$SCRIPT_DIR/../repos/spring-boot}"
OUT_PATH="${2:-$SCRIPT_DIR/../data/commits_basic.csv}"

mkdir -p "$(dirname "$OUT_PATH")"

# まずヘッダー行(列名)を書き込む
echo "hash,date,author" > "$OUT_PATH"

# git logの出力をCSVに変換する。
#
# ポイント: 作者名(author)には稀に "," が含まれることがある(例: "Yamada, Taro")。
# そのため git log の区切り文字には %x1f (ユニット区切り文字。キーボードから
# 打てない特殊な制御文字) を使い、awkで一旦フィールドに分割してから
# ダブルクォートで囲んだCSVに組み立て直している。
# ($'\x1f' はbashのANSI-Cクォーティングで「実際の0x1fという1バイト」を作る書き方。
#  awk側の正規表現で "\x1f" と書いても環境によっては解釈されないことがあるため、
#  bash側で実体化した文字を渡している)
git -C "$REPO_PATH" log --pretty=format:"%H%x1f%ad%x1f%an" --date=iso-strict \
  | awk -F $'\x1f' 'BEGIN { OFS = "," }
    {
      # フィールド中に " があれば "" にエスケープする(CSVの決まりごと)
      gsub(/"/, "\"\"", $1)
      gsub(/"/, "\"\"", $2)
      gsub(/"/, "\"\"", $3)
      print "\"" $1 "\",\"" $2 "\",\"" $3 "\""
    }' >> "$OUT_PATH"

echo "書き出し完了: $OUT_PATH"
wc -l < "$OUT_PATH" | xargs echo "行数(ヘッダー含む):"
