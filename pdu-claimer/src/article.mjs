// 公開されたnoteの記事から、PDU申請に必要な情報を取ってくるファイル。
//
// noteには「記事の情報を教えてくれる窓口」が公開されている。
//   https://note.com/api/v3/notes/<記事キー>
// ログインしなくても、公開記事ならこれで読める。

/**
 * 記事のURLから記事キー（nXXXXXX）を取り出す。
 *
 * 例: https://note.com/kota0235/n/nb47626f84b72 → nb47626f84b72
 */
export function toNoteKey(url) {
  const m = String(url).match(/\/(?:n|notes)\/(n[0-9a-zA-Z]+)/);
  if (!m) {
    throw new Error(
      `記事のURLから記事キーが読み取れませんでした: ${url}\n` +
        `https://note.com/ユーザー名/n/n××××××× の形で渡してください。`
    );
  }
  return m[1];
}

/**
 * 公開されたnote記事の情報を取ってくる。
 *
 * @returns {Promise<{key: string, title: string, url: string, publishedAt: string,
 *                    author: string, characters: number, isPublished: boolean}>}
 */
export async function fetchArticle(url) {
  const key = toNoteKey(url);
  const res = await fetch(`https://note.com/api/v3/notes/${key}`);
  if (!res.ok) {
    // 404は「そんな記事は無い」。下書きのままだと外からは見えないので、これになる。
    const hint =
      res.status === 404
        ? "\nまだ下書きのままか、URLが違う可能性があります。公開してから試してください。"
        : "";
    throw new Error(`記事の情報を取れませんでした（${res.status}）: ${url}${hint}`);
  }

  const json = await res.json();
  const data = json?.data;
  if (!data) throw new Error(`記事の情報が空でした: ${url}`);

  return {
    key,
    title: (data.name ?? "").trim(),
    url: data.note_url ?? url,
    publishedAt: (data.publish_at ?? "").slice(0, 10), // YYYY-MM-DD
    author: data.user?.urlname ?? "",
    characters: countCharacters(data.body ?? ""),
    isPublished: data.status === "published",
  };
}

/** HTMLのタグを取り除いて、本文の文字数を数える。 */
function countCharacters(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s/g, "").length;
}
