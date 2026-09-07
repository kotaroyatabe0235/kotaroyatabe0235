// noteのブラウザ操作をまとめたファイル。
//
// 方針:
// - noteには公式のAPI（外から記事を投稿する窓口）が無いので、
//   Playwrightで本物のブラウザを動かして、人と同じ操作をする。
// - ログイン情報はこのツールでは保存しない。かわりに「ブラウザのプロフィール」を
//   フォルダに残しておき、一度手でログインしたらその状態を使いまわす。
// - 安全のため「下書き保存」までしか行わない。公開ボタンは押さない。

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ログイン状態（Cookieなど）を保存しておくフォルダ。
// ここを消すと、またログインからやり直しになる。
export const PROFILE_DIR = path.join(__dirname, "..", ".browser-profile");

const NOTE_NEW_URL = "https://note.com/notes/new";
const NOTE_TOP_URL = "https://note.com/";
const NOTE_LOGIN_URL = "https://note.com/login";

// うまくいかなかったときの画面写真を置く場所。中身はコミットしない。
export const SHOT_DIR = path.join(__dirname, "..", ".tmp");

// 画面を出さずに動かすときの「名乗り」。ふつうのMacのChromeと同じ形にしておく。
const HUMAN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

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
  //
  // headless（画面を出さない）で動かすと、そのままでは
  // 「機械が操作している」ことがサイト側に丸見えになり、断られることがある。
  // ふつうのブラウザと同じ姿で動くように、次の3つを足している。
  //   channel   … 軽量版ではなく、本物と同じ中身のChromiumを使う
  //   userAgent … 名乗り。既定だと "HeadlessChrome" と自己申告してしまう
  //   args      … 自動操作の目印を消す
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    ...(headless ? { channel: "chromium", userAgent: HUMAN_UA } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
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
 * 今の画面の写真を撮って保存する。
 *
 * ブラウザの画面が見られない環境（SSH越しなど）で、
 * 何が起きているのかを確かめるために使う。
 */
export async function saveShot(page, name) {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// ログイン画面の入力欄を探すための「目印」の候補。
const LOGIN_ID_SELECTORS = [
  'input[name="login"]',
  'input[type="email"]',
  'input[placeholder*="メール"]',
];

const LOGIN_PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]'];

const LOGIN_SUBMIT_SELECTORS = [
  'button[type="submit"]:has-text("ログイン")',
  'button:has-text("ログイン")',
  'button[type="submit"]',
];

/**
 * メールアドレス（またはnote ID）とパスワードでログインする。
 *
 * ブラウザの窓を開けない環境のための入口。
 * パスワードはここを通り抜けるだけで、ファイルにも画面にも残さない。
 *
 * @returns {Promise<{ok: boolean, url: string}>}
 */
export async function loginWithPassword(page, { loginId, password }) {
  await page.goto(NOTE_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const idEl = await findFirst(page, LOGIN_ID_SELECTORS, "メールアドレスの入力欄");
  await idEl.fill(loginId);

  const pwEl = await findFirst(page, LOGIN_PASSWORD_SELECTORS, "パスワードの入力欄");
  await pwEl.fill(password);

  const submitEl = await findFirst(page, LOGIN_SUBMIT_SELECTORS, "ログインボタン");
  await submitEl.click();

  // 画面が切り替わるのを待つ。切り替わらない（＝失敗）こともあるので待ちすぎない。
  await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(3000);

  const ok = !page.url().includes("/login");
  return { ok, url: page.url(), message: ok ? null : await readLoginError(page) };
}

// ログイン画面に出るお断りの文言。見つかったらそのまま伝える。
const LOGIN_ERROR_PHRASES = [
  "しばらくたってから",
  "しばらく時間をおいて",
  "正しくありません",
  "一致しません",
  "ロック",
  "認証",
];

/**
 * ログイン画面に出ているエラー文言を拾う。
 */
async function readLoginError(page) {
  return await page.evaluate((phrases) => {
    const text = (document.body.innerText || "").replace(/\n{2,}/g, "\n");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const hit = lines.filter((l) => phrases.some((p) => l.includes(p)));
    return hit.length ? hit.join(" / ") : null;
  }, LOGIN_ERROR_PHRASES);
}

/**
 * ログイン後の画面に、追加で入力を求められている欄があるか調べる。
 *
 * noteは初めての場所からのログインだと、メールに届く「認証コード」を
 * 聞いてくることがある。その欄を見つけて返す。
 *
 * @returns {Promise<{selector: string, hint: string}|null>}
 */
export async function findExtraInput(page) {
  const found = await page.evaluate(() => {
    // ログイン画面のままなら、それは「追加の入力」ではなく失敗。
    // パスワード欄が残っているかどうかで見分ける。
    const hasPasswordField = [...document.querySelectorAll('input[type="password"]')].some(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }
    );
    if (hasPasswordField) return null;

    const inputs = [...document.querySelectorAll("input")].filter((el) => {
      if (el.type === "hidden" || el.type === "password") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (inputs.length !== 1) return null;

    const el = inputs[0];
    return {
      name: el.name || null,
      type: el.type,
      hint: (document.body.innerText || "").trim().slice(0, 300),
    };
  });

  if (!found) return null;

  const selector = found.name
    ? `input[name="${found.name}"]`
    : `input[type="${found.type}"]`;
  return { selector, hint: found.hint };
}

/**
 * 認証コードなどを入れて送信する。
 */
export async function submitExtraInput(page, selector, value) {
  await page.locator(selector).first().fill(value);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(5000);
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
 * 本文に置いた「目印」を、実際の画像に入れ替える。
 *
 * やり方:
 * 画像はHTMLの貼り付けでは入らない。noteのサーバーに預けないと表示できないからだ。
 * そこで「画像ファイルをコピーして貼り付けた」という出来事を作り出す。
 * noteのエディタはこれを受け取ると、自分でアップロードして画像に変えてくれる。
 *
 * @param {import("playwright").Page} page
 * @param {Array<{marker: string, filePath: string}>} images
 * @returns {Promise<Array<{marker: string, ok: boolean, reason?: string}>>}
 */
export async function insertImages(page, images) {
  const results = [];

  for (const image of images) {
    const name = path.basename(image.filePath);
    const type = imageMimeType(name);

    // 扱えない形式は、画面に触る前に弾く（ふつうは cli 側で先に外れている）。
    if (!type) {
      results.push({
        marker: image.marker,
        ok: false,
        reason: `扱えない形式です（${path.extname(name) || "拡張子なし"}）`,
      });
      continue;
    }

    const before = await countUploadedImages(page);
    const figuresBefore = await figureIds(page);

    // 目印が書かれている段落を探す
    const target = page.locator("div.ProseMirror p", { hasText: image.marker }).first();
    if (!(await target.isVisible().catch(() => false))) {
      results.push({ marker: image.marker, ok: false, reason: "目印が見つからなかった" });
      continue;
    }
    // 3回クリックすると、その段落全体が選ばれる（人がやるのと同じ操作）。
    // 選んだだけでは画像に置きかわらないので、先に消して空の段落にしておく。
    await target.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    const base64 = (await fs.readFile(image.filePath)).toString("base64");

    // 選んだ範囲の上に画像を貼り付ける＝目印が画像に置きかわる
    await page.locator("div.ProseMirror").first().evaluate(
      (el, { base64, name, type }) => {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const file = new File([bytes], name, { type });
        const dt = new DataTransfer();
        dt.items.add(file);

        el.focus();
        el.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        );
      },
      { base64, name, type }
    );

    // アップロードが終わるまで待つ。終わるとnoteの画像置き場のURLに変わる。
    const uploaded = await waitForUpload(page, before);
    if (uploaded && image.alt) {
      await fillCaption(page, figuresBefore, image.alt);
    }
    results.push(
      uploaded
        ? { marker: image.marker, ok: true }
        : { marker: image.marker, ok: false, reason: "アップロードが終わらなかった" }
    );
  }

  await removeEmptyLinesBeforeImages(page);
  return results;
}

/**
 * 画像の上にできてしまう空っぽの行を消す。
 *
 * 目印の文字を消した跡が「空の段落」として残り、その下に画像が入る。
 * 人が見ると余計な空白になるので、後片付けとして消しておく。
 */
async function removeEmptyLinesBeforeImages(page) {
  // 画像の枚数を覚えておく。後片付けで画像まで消してしまったら、すぐ元に戻すため。
  const expected = await countUploadedImages(page);
  // 何をしても消えなかった行。同じ行で堂々めぐりしないように覚えておく。
  const skip = new Set();

  // 消すたびに順番がずれるので、1つ消すたびに調べ直す
  for (let guard = 0; guard < 20; guard++) {
    // 「ひとつ上が文字の行」で「自分が空」で「ひとつ下が画像」の行を探し、
    // ひとつ上の行の末尾にカーソルを置く。
    //
    // カーソルはクリックではなくブラウザの仕組み（Selection）で直接置く。
    // クリックだと、狙った場所からずれることがあるため。
    const placed = await page.evaluate((skipList) => {
      const el = document.querySelector("div.ProseMirror");
      if (!el) return null;
      const nodes = [...el.children];

      const index = nodes.findIndex((node, i) => {
        if (skipList.includes(i)) return false;
        const isEmptyLine =
          node.tagName === "P" &&
          (node.textContent || "").trim() === "" &&
          !node.querySelector("img");
        const next = nodes[i + 1];
        return isEmptyLine && next && !!next.querySelector?.("img");
      });
      if (index < 0) return null;

      // ひとつ上が文字の行なら、その末尾にカーソルを置いて下を引き寄せる。
      // ひとつ上が画像なら引き寄せ先が無いので、空の行そのものにカーソルを置く。
      const prev = nodes[index - 1];
      const prevIsText =
        prev && !prev.querySelector?.("img") && (prev.textContent || "").trim() !== "";
      const anchor = prevIsText ? prev : nodes[index];

      const range = document.createRange();
      range.selectNodeContents(anchor);
      range.collapse(false); // 末尾へ
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      el.focus();
      return index;
    }, [...skip]);

    if (placed === null) return;

    // 「うしろを引き寄せる」＝下の空行が消えて、上の行にくっつく
    const lengthBefore = await bodyTextLength(page);
    const linesBefore = await lineCount(page);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);

    // 画像が減った・文字が減ったなら、やりすぎ。元に戻して後片付けをやめる。
    const brokeSomething =
      (await countUploadedImages(page)) < expected || (await bodyTextLength(page)) < lengthBefore;
    if (brokeSomething) {
      await page.keyboard.press("ControlOrMeta+Z");
      await page.waitForTimeout(500);
      return;
    }

    if ((await lineCount(page)) < linesBefore) {
      // 消せた。行の位置がずれるので、あきらめた印は付け直す
      skip.clear();
    } else {
      // 消えなかった行は、もう触らない
      skip.add(placed);
    }
  }
}

/** 本文が何行（何かたまり）あるか数える。 */
async function lineCount(page) {
  return await page.evaluate(() => {
    const el = document.querySelector("div.ProseMirror");
    return el ? el.children.length : 0;
  });
}

/** 本文の文字数を数える（後片付けで文字を消していないか確かめるため）。 */
async function bodyTextLength(page) {
  return await page.evaluate(() => {
    const el = document.querySelector("div.ProseMirror");
    return el ? (el.textContent || "").replace(/\s/g, "").length : 0;
  });
}

/** いま本文にある画像のかたまり（figure）の名札を集める。 */
async function figureIds(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll("div.ProseMirror figure")].map((f) => f.id).filter(Boolean)
  );
}

/**
 * 画像の下のキャプション欄に、Markdownの説明文（altテキスト）を入れる。
 *
 * どの画像に入れるかは、貼り付ける前に集めた名札と見くらべて、
 * 新しく増えたものを選ぶ。
 */
async function fillCaption(page, figuresBefore, caption) {
  const newId = await page.evaluate((known) => {
    const figures = [...document.querySelectorAll("div.ProseMirror figure")];
    const added = figures.find((f) => f.id && !known.includes(f.id));
    return added ? added.id : null;
  }, figuresBefore);

  if (!newId) return false;

  const target = page.locator(`figure[id="${newId}"] figcaption`).first();
  if (!(await target.isVisible().catch(() => false))) return false;

  await target.click();
  await page.keyboard.type(caption);
  await page.waitForTimeout(500);
  return true;
}

/** noteに預け終わった画像の数を数える。 */
async function countUploadedImages(page) {
  return await page.evaluate(() => {
    const el = document.querySelector("div.ProseMirror");
    if (!el) return 0;
    return [...el.querySelectorAll("img")].filter((i) => i.src.includes("st-note.com")).length;
  });
}

/** 画像が1枚ふえるまで待つ。 */
async function waitForUpload(page, before, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if ((await countUploadedImages(page)) > before) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

// noteに預けられる画像の形式。
// ここに無い拡張子を「たぶんJPEG」として送ると、中身と名乗りが食い違ったファイルを
// 預けることになり、断られるか、壊れて表示される。だから送らずに弾く。
const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * ファイル名から画像の種類を決める。扱えない形式なら null を返す。
 */
export function imageMimeType(name) {
  return IMAGE_MIME_TYPES[path.extname(name).toLowerCase()] ?? null;
}

/**
 * いま開いている記事の中身をざっと調べる。
 *
 * 公開する前に「本当にこれでいいか」を人に見せるために使う。
 */
export async function readArticleSummary(page) {
  return await page.evaluate(() => {
    const title = document.querySelector('textarea[placeholder*="タイトル"]')?.value?.trim() ?? "";
    const body = document.querySelector("div.ProseMirror");
    const text = body ? (body.textContent || "").trim() : "";
    return {
      title,
      textLength: text.replace(/\s/g, "").length,
      head: text.slice(0, 120),
      images: body ? body.querySelectorAll("img").length : 0,
      blocks: body ? body.children.length : 0,
    };
  });
}

/**
 * 「公開に進む」を押して、公開設定の画面へ進む。
 *
 * ここではまだ公開されない。最後の「投稿する」を押すまでは下書きのまま。
 */
export async function openPublishScreen(page) {
  const btn = page.locator('button:has-text("公開に進む")').first();
  if (!(await btn.isVisible().catch(() => false))) {
    throw new Error(
      "「公開に進む」ボタンが見つかりませんでした。\n" +
        "すでに公開済みの記事か、noteの画面の作りが変わった可能性があります。"
    );
  }

  await btn.click();
  await page.waitForURL((url) => url.pathname.includes("/publish"), { timeout: 30000 });
  await page.waitForTimeout(4000);
  return page.url();
}

/**
 * 公開設定の画面で「投稿する」を押す。＝ここで本当に公開される。
 *
 * 「更新する」など別の文字のボタンは押さない。
 * 押していいのは、はっきり「投稿する」と書かれたボタンだけにしてある。
 */
export async function clickPublish(page) {
  const btn = page.locator('button:has-text("投稿する")').first();
  if (!(await btn.isVisible().catch(() => false))) {
    throw new Error("「投稿する」ボタンが見つかりませんでした。公開はしていません。");
  }

  await btn.click();

  // 公開が終わると、公開設定の画面から離れる
  await page
    .waitForURL((url) => !url.pathname.includes("/publish"), { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(5000);
  return page.url();
}

/**
 * 記事がほんとうに公開されたか確かめる。
 *
 * noteの公開ページ（note.com/ユーザー名/n/記事キー）を開いて、
 * 中身が読めるかどうかで判断する。
 */
export async function confirmPublished(page, noteKey) {
  const res = await page.request.get(`https://note.com/api/v3/notes/${noteKey}`);
  if (!res.ok()) return { published: false, url: null };

  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!data) return { published: false, url: null };

  return {
    published: data.status === "published",
    url: data.note_url ?? null,
    status: data.status ?? null,
  };
}

/** 記事のURLから記事キー（nXXXXXX）を取り出す。 */
export function toNoteKey(url) {
  const m = url.match(/\/(?:n|notes)\/(n[0-9a-zA-Z]+)/);
  if (!m) throw new Error(`記事のURLから記事キーが読み取れませんでした: ${url}`);
  return m[1];
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
