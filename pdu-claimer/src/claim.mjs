// note記事の情報から、PDU申請に書く内容を組み立てるファイル。
//
// PMPのPDUには大きく2種類ある。
//   Education   … 学ぶ（研修・読書など）。3年で最低35PDU
//   Giving Back … 返す（発表・執筆・ボランティアなど）。3年で最大25PDU
//
// 記事を書くのは Giving Back の中の「Create Content（コンテンツを作る）」にあたる。
// 数えかたは、実際にかけた時間で 1時間 = 1PDU。

/** 申請の区分。記事の執筆はここで固定。 */
export const CATEGORY = "Giving Back — Create Content";

/**
 * CCRSの「Organization」欄に入れる名前。
 *
 * 自分で書いて自分で出した記事なので、依頼主となる団体はいない。
 * PMIの様式ではこういう場合 "Self" と書く。
 */
export const ORGANIZATION = "Self";

// メモ: Create Content にはタレント・トライアングル（Ways of Working /
// Power Skills / Business Acumen）の割り振り欄が無い。
// CCRSの入力欄は Giving Back の数値ひとつだけ。実際のフォームで確認済み。

/** 1記事あたりの既定の時間（＝PDU）。実際にかけた時間に合わせて変える。 */
export const DEFAULT_HOURS = 2;

/**
 * 申請内容を組み立てる。
 *
 * @param {{title: string, url: string, publishedAt: string, characters: number}} article
 * @param {{hours?: number|null, talentTriangle?: string}} options
 */
export function buildClaim(article, { hours = null, organization = ORGANIZATION } = {}) {
  const pdu = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_HOURS;

  return {
    category: CATEGORY,
    organization,
    title: article.title,
    description: buildDescription(article),
    dateStarted: article.publishedAt,
    dateCompleted: article.publishedAt,
    pdu,
    url: article.url,
    noteKey: article.key,
  };
}

/** 2026-05-09 → 05/09/2026（CCRSの日付欄の書き方）。 */
export function toUsDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

/**
 * 申請の説明文を作る。
 *
 * CCRSの説明欄は英語で書くのが無難なので、英語で組み立てる。
 * 「何を書いたか」「どこに出したか」が分かる形にしておくと、
 * あとで監査（本当にやったかの確認）が来ても説明しやすい。
 */
function buildDescription(article) {
  return (
    `Wrote and published a project management article on note.com ` +
    `("${article.title}", about ${article.characters} characters, ` +
    `published ${article.publishedAt}). ` +
    `Shared lessons learned from my own practice with the wider practitioner community. ` +
    `Article URL: ${article.url}`
  );
}
