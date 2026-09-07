// Markdownを、noteのエディタに貼り付けられるHTMLに変換する処理をまとめたファイル。
//
// なぜHTMLにするのか:
// noteのエディタは「リッチテキストエディタ」といって、見た目そのままで編集する形式。
// Markdownの記号（## など）をそのまま貼り付けても、ただの文字として入ってしまう。
// でも「HTMLとして貼り付け」ると、noteのエディタが自分で見出しや太字に変換してくれる。
// だからMarkdown → HTML に直してから貼り付ける。

import path from "node:path";

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

// 画像の場所を覚えておくための「目印」の文字列。
// 本文にまず目印を入れておき、あとでそこを画像に入れ替える。
// ふつうの文章には出てこない形にしてある。
const IMAGE_MARKER = (index) => `⟦note-image-${index}⟧`;

// `![説明](ファイル名)` だけが書かれている行にあてはめる型。
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)\s*$/;

// 文章の途中に混ざった `![説明](ファイル名)` を見つけるための型。
const INLINE_IMAGE = /!\[[^\]]*\]\([^)\s]+\)/g;

/**
 * 本文から画像の行を抜き出し、そこを「目印」に置きかえる。
 *
 * なぜ置きかえるのか:
 * 文字はHTMLとして1回で貼り付けられるが、画像はそうはいかない。
 * 画像はnoteのサーバーに1枚ずつ預ける必要があるので、
 * 「あとでここに入れる」という目印だけ先に置いておき、
 * 本文を入れ終わってから、目印を1つずつ画像に入れ替える。
 *
 * ネット上の画像（http/https）は預けようがないので、目印にしないでそのまま残す。
 * その場合の `marker` は null になる。
 *
 * 文章の途中に混ざった画像も目印にできない。こちらは `inlineImages` に集めて返す。
 *
 * @param {string} markdown - 本文（タイトルを取り除いたもの）
 * @param {string} baseDir - Markdownファイルが置いてあるフォルダ。相対パスの起点になる
 * @returns {{markdown: string,
 *            images: Array<{marker: string|null, alt: string, src: string, filePath: string|null}>,
 *            inlineImages: string[]}}
 */
export function extractImages(markdown, baseDir) {
  const images = [];
  const inlineImages = [];

  const replaced = markdown
    .split("\n")
    .map((line) => {
      const m = line.match(IMAGE_LINE);
      if (!m) {
        // 文章の途中に書かれた画像は、目印にできない（行ごと置きかえられないため）。
        // このあと <img> になるが、ローカルの画像はnoteに保存されず黙って消える。
        // 直しようがないので、呼び出し側で知らせるために覚えておく。
        inlineImages.push(...(line.match(INLINE_IMAGE) ?? []));
        return line;
      }

      const [, alt, src] = m;

      // ネット上の画像（http/https）はこのパソコンに無いので、預けようがない。
      // 目印に置きかえると、差し替える相手がいないまま
      // 本文に「⟦note-image-N⟧」の文字が残ってしまう。だから行はそのまま返す。
      if (/^https?:\/\//.test(src)) {
        images.push({ marker: null, alt, src, filePath: null });
        return line;
      }

      const marker = IMAGE_MARKER(images.length);

      images.push({
        marker,
        alt,
        src,
        filePath: resolveFrom(baseDir, src),
      });

      return marker;
    })
    .join("\n");

  return { markdown: replaced, images, inlineImages };
}

function resolveFrom(baseDir, src) {
  const decoded = decodeURI(src);
  return path.isAbsolute(decoded) ? decoded : path.join(baseDir, decoded);
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
