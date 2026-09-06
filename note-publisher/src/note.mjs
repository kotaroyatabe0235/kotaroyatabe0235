// noteのブラウザ操作をまとめたファイル。
//
// 方針:
// - noteには公式のAPI（外から記事を投稿する窓口）が無いので、
//   Playwrightで本物のブラウザを動かして、人と同じ操作をする。
// - ログイン情報はこのツールでは保存しない。かわりに「ブラウザのプロフィール」を
//   フォルダに残しておき、一度手でログインしたらその状態を使いまわす。
// - 安全のため「下書き保存」までしか行わない。公開ボタンは押さない。

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ログイン状態（Cookieなど）を保存しておくフォルダ。
// ここを消すと、またログインからやり直しになる。
export const PROFILE_DIR = path.join(__dirname, "..", ".browser-profile");

const NOTE_NEW_URL = "https://note.com/notes/new";
const NOTE_TOP_URL = "https://note.com/";

/**
 * ブラウザを開く。
 *
 * @param {{headless: boolean}} opts
 *   headless=true にすると画面を出さずに裏で動かす。
 *   false なら実際にブラウザの窓が出るので、様子が見える。
 */
export async function openBrowser({ headless = false } = {}) {
  // launchPersistentContext は「同じプロフィールを使い続ける」起動のしかた。
  // これによりログイン状態が次回も残る。
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/**
 * ログイン済みかどうかを調べる。
 *
 * noteのトップページを開いて、「ログイン」ボタンが見えるかどうかで判断する。
 * ログイン済みなら「ログイン」ボタンは出ない。
 */
export async function isLoggedIn(page) {
  await page.goto(NOTE_TOP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // 「ログイン」という文字のリンクが見えていれば、まだログインしていない
  const loginLink = page.locator('a[href*="/login"]').first();
  const visible = await loginLink.isVisible().catch(() => false);
  return !visible;
}

/**
 * 記事の編集画面を開く。
 *
 * @param {import("playwright").Page} page
 * @param {string|null} existingUrl
 *   nullなら新しい記事を作る。
 *   URLを渡すと、その記事の編集画面を開く（＝書きかえる）。
 */
export async function openEditor(page, existingUrl = null) {
  if (existingUrl) {
    // 渡されたURLから記事のキー（nXXXXXXという部分）を取り出して編集URLを組み立てる
    const editUrl = toEditUrl(existingUrl);
    await page.goto(editUrl, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(NOTE_NEW_URL, { waitUntil: "domcontentloaded" });
  }

  // エディタの読み込みが終わるまで少し待つ
  await page.waitForTimeout(4000);
  return page.url();
}

/**
 * 記事のURLから編集用のURLを作る。
 *
 * 例: https://note.com/xxxx/n/nabc123  →  https://note.com/notes/nabc123/edit
 */
export function toEditUrl(url) {
  // すでに編集URLならそのまま使う
  if (url.includes("/edit")) return url;

  // /n/ の後ろにある記事キーを取り出す
  const m = url.match(/\/n\/(n[0-9a-zA-Z]+)/);
  if (m) {
    return `https://note.com/notes/${m[1]}/edit`;
  }

  // note.com/notes/xxxx の形にも対応
  const m2 = url.match(/\/notes\/(n[0-9a-zA-Z]+)/);
  if (m2) {
    return `https://note.com/notes/${m2[1]}/edit`;
  }

  throw new Error(
    `記事のURLから編集画面の場所が分かりませんでした: ${url}\n` +
      `https://note.com/ユーザー名/n/n××××××× の形で渡してください。`
  );
}

// エディタの部品を探すための「目印」の候補。
// noteの作りが変わったときは、ここを直せば直せるようにまとめてある。
const TITLE_SELECTORS = [
  'textarea[placeholder*="タイトル"]',
  'textarea[placeholder*="記事タイトル"]',
  '[data-testid="title-input"]',
  "textarea#note-title",
  "h1textarea",
];

const BODY_SELECTORS = [
  'div[contenteditable="true"].ProseMirror',
  "div.ProseMirror",
  '[data-testid="editor-body"]',
  'div[contenteditable="true"]',
];

/**
 * 候補の中から、実際に画面にある部品を探す。
 */
async function findFirst(page, selectors, label) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      return loc;
    }
  }
  throw new Error(
    `${label}が見つかりませんでした。\n` +
      `noteの画面の作りが変わった可能性があります。\n` +
      `\`node src/cli.mjs probe\` を実行して、今の画面の作りを調べてください。`
  );
}

/**
 * タイトルを入力する。
 */
export async function fillTitle(page, title) {
  const titleEl = await findFirst(page, TITLE_SELECTORS, "タイトル欄");
  await titleEl.click();
  // いったん中身を全部消してから入れ直す（書きかえのとき用）
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await titleEl.fill(title);
  await page.waitForTimeout(500);
}

/**
 * 本文を入れる。
 *
 * ここが一番の工夫どころ。
 * 文字を1文字ずつ打ち込むのではなく、「HTMLを貼り付けた」ことにする。
 * するとnoteのエディタが自分で見出し・太字・リストに変換してくれる。
 */
export async function fillBody(page, html) {
  const bodyEl = await findFirst(page, BODY_SELECTORS, "本文欄");
  await bodyEl.click();

  // 書きかえのときのために、いったん中身を全部消す
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);

  // 「貼り付け」の出来事を、ブラウザの中で作り出す
  await bodyEl.evaluate((el, htmlText) => {
    const dt = new DataTransfer();
    dt.setData("text/html", htmlText);
    dt.setData("text/plain", el.textContent ?? "");

    el.focus();
    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ev);
  }, html);

  await page.waitForTimeout(2000);
}

/**
 * 下書きとして保存する。
 *
 * 「公開」ボタンは押さない。安全のため、ここで止める。
 */
export async function saveDraft(page) {
  const candidates = [
    'button:has-text("下書き保存")',
    'button:has-text("保存")',
    '[data-testid="draft-save-button"]',
  ];

  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(3000);
      return true;
    }
  }

  // ボタンが見つからない場合、noteは自動保存されることが多いので警告だけ出す
  return false;
}
