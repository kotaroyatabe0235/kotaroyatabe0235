// Markdownを、noteのエディタに貼り付けられるHTMLに変換する処理をまとめたファイル。
//
// なぜHTMLにするのか:
// noteのエディタは「リッチテキストエディタ」といって、見た目そのままで編集する形式。
// Markdownの記号（## など）をそのまま貼り付けても、ただの文字として入ってしまう。
// でも「HTMLとして貼り付け」ると、noteのエディタが自分で見出しや太字に変換してくれる。
// だからMarkdown → HTML に直してから貼り付ける。

import { marked } from "marked";

/**
 * Markdownの本文から「タイトル」と「本文」を切り分ける。
 *
 * noteは「タイトル欄」と「本文欄」が分かれているので、
 * Markdownの一番最初の `# 見出し` をタイトルとして使い、本文からは取り除く。
 *
 * @param {string} markdown - Markdownファイルの中身
 * @returns {{title: string|null, body: string}}
 */
export function splitTitleAndBody(markdown) {
  const lines = markdown.split("\n");

  // 先頭の空行を読み飛ばして、最初に中身のある行を探す
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") {
    i++;
  }

  // その行が `# タイトル` の形なら、タイトルとして取り出す
  const h1Match = lines[i]?.match(/^#\s+(.+)$/);
  if (h1Match) {
    const title = h1Match[1].trim();
    const body = lines.slice(i + 1).join("\n");
    return { title, body };
  }

  // `# タイトル` が無い場合はタイトル無しとして扱う（呼び出し側で決める）
  return { title: null, body: markdown };
}

/**
 * Markdown本文をHTMLに変換する。
 *
 * @param {string} markdown
 * @returns {string} HTML文字列
 */
export function markdownToHtml(markdown) {
  // gfm: GitHubで使われているMarkdownの書き方（表やチェックリストなど）に対応する
  // breaks: 改行をそのまま改行として扱う（noteの見た目に近づけるため）
  return marked.parse(markdown, { gfm: true, breaks: true, async: false });
}
