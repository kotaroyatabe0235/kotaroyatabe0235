#!/usr/bin/env python3
"""
pandasを使ってコミット履歴を分析する雛形スクリプト。

Java/SQLの経験がある人向けの対応イメージ:
    - DataFrame          … SQLの「テーブル」
    - df["col"]           … SELECT col FROM ...
    - df[df["x"] > 1]      … WHERE x > 1
    - df.groupby("a").sum() … GROUP BY a ... SUM(...)
    - df.sort_values(...)  … ORDER BY ...
    - df.head(10)          … LIMIT 10

このスクリプトは「雛形」なので、まずはこのまま実行して結果を眺め、
そのあとで自分の見たい切り口(日付範囲、特定の作者、特定のディレクトリ配下など)
に合わせて条件やgroupbyの列を書き換えていくのがおすすめ。

使い方:
    python 04_analyze.py
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
BASIC_CSV = SCRIPT_DIR / "../data/commits_basic.csv"
NUMSTAT_CSV = SCRIPT_DIR / "../data/commits_numstat_tidy.csv"


def load_basic(path: Path) -> pd.DataFrame:
    # parse_dates=["date"] を指定すると、日付の列が単なる文字列ではなく
    # 日時として扱われる(比較・並び替え・月ごとの集計などがしやすくなる)。
    df = pd.read_csv(path, parse_dates=["date"])
    return df


def load_numstat(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"])
    return df


def print_section(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def analyze_basic(df: pd.DataFrame) -> None:
    print_section("1. 基本情報 (SELECT COUNT(*), MIN(date), MAX(date) 相当)")
    print(f"コミット数: {len(df)}")
    print(f"期間: {df['date'].min()} 〜 {df['date'].max()}")

    print_section("2. 作者ごとのコミット数 (GROUP BY author 相当)")
    # value_counts() は「値ごとの出現回数を数えて降順に並べる」よくある操作。
    # SQLでいう GROUP BY author ORDER BY COUNT(*) DESC に近い。
    author_counts = df["author"].value_counts()
    print(author_counts.head(10))


def analyze_numstat(df: pd.DataFrame) -> None:
    # 1コミット×1ファイルの粒度なので、まずは「コミット単位の変更行数」を作る。
    # SQLでいう GROUP BY hash, SUM(added), SUM(deleted) に相当する。
    per_commit = (
        df.groupby("hash")
        .agg(
            added=("added", "sum"),
            deleted=("deleted", "sum"),
            files_changed=("filename", "count"),
        )
        .reset_index()
    )
    per_commit["total_changed"] = per_commit["added"] + per_commit["deleted"]

    print_section("3. コミットごとの変更行数の統計 (平均・中央値など)")
    # mean() = 平均、median() = 中央値。
    # 平均は外れ値(巨大なコミット)に引っ張られやすいので、
    # 中央値と比べてみると「典型的なコミットの大きさ」が見えてくる。
    print(f"平均 (mean):   {per_commit['total_changed'].mean():.1f} 行")
    print(f"中央値 (median): {per_commit['total_changed'].median():.1f} 行")
    print("\ndescribe() による要約統計量:")
    print(per_commit["total_changed"].describe())

    print_section("4. 外れ値(巨大なコミット)の検出: IQR(四分位範囲)法")
    # IQR法: 第1四分位(Q1)〜第3四分位(Q3)の範囲(IQR)から
    # 大きく外れた値を「外れ値」とみなす、統計でよく使われる簡便な方法。
    q1 = per_commit["total_changed"].quantile(0.25)
    q3 = per_commit["total_changed"].quantile(0.75)
    iqr = q3 - q1
    upper_bound = q3 + 1.5 * iqr

    outliers = per_commit[per_commit["total_changed"] > upper_bound].sort_values(
        "total_changed", ascending=False
    )
    print(f"Q1={q1:.1f}, Q3={q3:.1f}, IQR={iqr:.1f}, 外れ値の閾値(上限)={upper_bound:.1f}")
    print(f"外れ値と判定されたコミット数: {len(outliers)} / {len(per_commit)}")
    print("\n変更行数が最も大きいコミット トップ10:")
    print(outliers[["hash", "added", "deleted", "files_changed", "total_changed"]].head(10))

    print_section("5. よく変更されているファイル トップ10 (GROUP BY filename 相当)")
    file_counts = df["filename"].value_counts()
    print(file_counts.head(10))

    print_section("6. 作者ごとの合計変更行数 トップ10")
    per_author = (
        df.groupby("author")
        .agg(added=("added", "sum"), deleted=("deleted", "sum"))
        .assign(total_changed=lambda d: d["added"] + d["deleted"])
        .sort_values("total_changed", ascending=False)
    )
    print(per_author.head(10))


def main() -> None:
    basic_df = load_basic(BASIC_CSV)
    numstat_df = load_numstat(NUMSTAT_CSV)

    analyze_basic(basic_df)
    analyze_numstat(numstat_df)


if __name__ == "__main__":
    main()
