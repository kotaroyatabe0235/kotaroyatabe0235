#!/usr/bin/env python3
"""
02_export_log_numstat.sh が出力した「生ログ」を読み込み、
tidyな(1行=1コミット×1変更ファイル)CSVに変換するスクリプト。

このスクリプトはあえてpandasを使わず、標準ライブラリのcsvモジュールだけで
書いている。「テキストを1行ずつ読んで、条件分岐して、辞書に詰めて…」という
泥臭い処理を先に体感してから、次のステップ(04_analyze.py)で
pandasを使うとどれだけ楽になるかを比較できるようにするため。

使い方:
    python 03_parse_numstat.py [入力ファイル] [出力CSV]

入力ファイルの中身のイメージ(1コミットぶん):
    COMMIT<0x1f>abc123<0x1f>2024-01-01T00:00:00+09:00<0x1f>Taro Yamada
    10\t2\tsrc/main/java/Foo.java
    -\t-\tsrc/main/resources/image.png   (バイナリファイルは行数が "-" になる)
"""
# 型ヒントを list[dict] / dict | None のように新しい書き方で書けるようにする。
# (この一行がないと、venvを使わずシステム標準のPython 3.9で実行した場合に
#  構文エラーになることがあるための保険)
from __future__ import annotations

import csv
import sys
from pathlib import Path

# git log 側で仕込んだ「コミットの目印」の接頭辞と区切り文字
COMMIT_PREFIX = "COMMIT"
FIELD_SEP = "\x1f"  # ユニット区切り文字(shellスクリプトの %x1f と対応)


def parse_numstat_log(input_path: Path) -> list[dict]:
    """生ログを読み込み、tidyな行のリスト(辞書のlist)を返す。

    SQLで例えるなら、コミット単位の情報(hash, date, author)を
    ファイル単位の行(added, deleted, filename)に対して
    "JOIN"して展開しているイメージ。
    """
    rows: list[dict] = []
    current_commit: dict | None = None

    with input_path.open(encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.rstrip("\n")

            if not line:
                # numstatの出力ではコミットの区切りに空行が入るので読み飛ばす
                continue

            if line.startswith(COMMIT_PREFIX):
                # コミットのヘッダー行: "COMMIT<0x1f>hash<0x1f>date<0x1f>author"
                _, commit_hash, date, author = line.split(FIELD_SEP)
                current_commit = {
                    "hash": commit_hash,
                    "date": date,
                    "author": author,
                }
                continue

            # ここに来るのはファイル単位の変更行: "追加\t削除\tファイル名"
            parts = line.split("\t")
            if len(parts) != 3 or current_commit is None:
                # 想定外の形式の行は安全のためスキップする
                continue

            added_str, deleted_str, filename = parts
            rows.append(
                {
                    "hash": current_commit["hash"],
                    "date": current_commit["date"],
                    "author": current_commit["author"],
                    # バイナリファイルは追加/削除行数が "-" になるので
                    # 数値に変換できないケースは欠損値(空文字)として扱う
                    "added": added_str if added_str != "-" else "",
                    "deleted": deleted_str if deleted_str != "-" else "",
                    "filename": filename,
                }
            )

    return rows


def write_tidy_csv(rows: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["hash", "date", "author", "added", "deleted", "filename"]
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    default_input = script_dir / "../data/commits_numstat_raw.txt"
    default_output = script_dir / "../data/commits_numstat_tidy.csv"

    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_input
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else default_output

    rows = parse_numstat_log(input_path)
    write_tidy_csv(rows, output_path)

    print(f"書き出し完了: {output_path}")
    print(f"行数(ファイル変更単位): {len(rows)}")


if __name__ == "__main__":
    main()
