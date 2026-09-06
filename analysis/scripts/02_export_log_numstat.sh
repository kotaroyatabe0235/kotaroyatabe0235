#!/usr/bin/env bash
#
# git log --numstat の「生ログ」を書き出すスクリプト。
#
# --numstat を付けると、各コミット情報の後ろに
#   追加行数<TAB>削除行数<TAB>ファイル名
# という行がファイルの数だけ続けて出力される。
# これは「1行=1コミット」のCSVにはならない(1コミットに複数行が対応する)ため、
# ここでは一旦テキストとして保存するだけにとどめ、
# tidyな(1行=1コミット×1ファイルの)CSVへの変換は
# 03_parse_numstat.py (Python) で行う。
#
# 【重要】対象コミット数について:
# 01のスクリプトは「clone」で --filter=blob:none を使っている。これは
# ファイルの中身(blob)をダウンロードせず、コミットの木構造とメタデータだけを
# 先に持ってくる軽量なcloneの方法。
# 一方、--numstat は「追加/削除行数」を出すためにファイルの中身の差分を
# 計算する必要があるので、blob:noneでcloneした直後は手元にblobが無く、
# gitがコミットごとにGitHubへ都度blobを取りに行く(遅延フェッチする)。
# そのため全コミット(spring-bootだと6万件以上)を対象にすると、
# 実測で1コミットあたり0.3秒前後 x 6万件 = 数時間かかってしまう。
#
# 学習用途では「直近のN件」で十分に統計(平均/中央値/外れ値/集計)を
# 体感できるため、デフォルトでは直近1500件に絞っている。
# もっと多くのデータで試したい場合は第3引数で件数を増やせる
# (ただし件数を増やすほど初回実行に時間がかかる点に注意)。
#
# 使い方:
#   ./02_export_log_numstat.sh [対象リポジトリのパス] [出力先ファイルのパス] [対象コミット数]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

REPO_PATH="${1:-$SCRIPT_DIR/../repos/spring-boot}"
OUT_PATH="${2:-$SCRIPT_DIR/../data/commits_numstat_raw.txt}"
MAX_COMMITS="${3:-1500}"

mkdir -p "$(dirname "$OUT_PATH")"

echo "直近 $MAX_COMMITS 件のコミットを対象に numstat を取得します(初回はblobの取得で数分かかることがあります)"

# コミットの区切りがわかるように、各コミットの先頭行に
# "COMMIT<0x1f>ハッシュ<0x1f>日付<0x1f>作者" という目印を仕込んでおく。
# (0x1f = %x1f はユニット区切り文字。通常のログ本文には出てこない前提)
git -C "$REPO_PATH" log -n "$MAX_COMMITS" --numstat --pretty=format:"COMMIT%x1f%H%x1f%ad%x1f%an" --date=iso-strict \
  > "$OUT_PATH"

echo "書き出し完了: $OUT_PATH"
wc -l < "$OUT_PATH" | xargs echo "行数:"
