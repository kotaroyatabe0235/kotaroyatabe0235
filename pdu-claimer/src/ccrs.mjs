// PMIのCCRS（PDUを申請するサイト）をブラウザで操作するファイル。
//
// 方針:
// - CCRSには外から申請するための公式の窓口（API）が無いので、
//   Playwrightで本物のブラウザを動かして、人と同じ操作をする。
// - ログイン情報はこのツールでは保存しない。かわりに「ブラウザのプロフィール」を
//   フォルダに残しておき、一度ログインしたらその状態を使いまわす。
// - PDUの申請は取り消しがきかないうえ、PMIの監査（本当にやったかの確認）の対象になる。
//   だから「送信」の一歩手前で必ず止まる作りにしてある。

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROFILE_DIR = path.join(__dirname, "..", ".browser-profile");
export const SHOT_DIR = path.join(__dirname, "..", ".tmp");

const CCRS_URL = "https://ccrs.pmi.org/";
const CCRS_DASHBOARD = "https://ccrs.pmi.org/dashboard";
const IDP_HOST = "idp.pmi.org";

// 画面を出さずに動かすときの「名乗り」。ふつうのMacのChromeと同じ形にしておく。
const HUMAN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

/**
 * ブラウザを開く。
 *
 * headless=true だと画面を出さずに裏で動く（SSH越しでも使える）。
 * そのままでは「機械が操作している」と見抜かれることがあるので、
 * ふつうのブラウザと同じ姿にそろえてある。
 */
export async function openBrowser({ headless = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    ...(headless ? { channel: "chromium", userAgent: HUMAN_UA } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Tokyo",
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/** 今の画面の写真を撮って保存する（画面が見られないときの手がかり）。 */
export async function saveShot(page, name) {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/**
 * ログイン済みかどうかを調べる。
 *
 * CCRSの画面を開いてみて、PMIのログイン画面（idp.pmi.org）に
 * 飛ばされなければログイン済み。
 */
export async function isLoggedIn(page) {
  await page.goto(CCRS_DASHBOARD, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  return !page.url().includes(IDP_HOST);
}

/**
 * ユーザー名とパスワードでPMIにログインする。
 *
 * パスワードはここを通り抜けるだけで、ファイルにも画面にも残さない。
 *
 * @returns {Promise<{ok: boolean, url: string, needsMore: boolean, screenText: string}>}
 */
export async function loginWithPassword(page, { username, password }) {
  await page.goto(CCRS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // すでにログイン済みならそのまま終わり
  if (!page.url().includes(IDP_HOST)) {
    await page.goto(CCRS_DASHBOARD, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    if (!page.url().includes(IDP_HOST)) {
      return { ok: true, url: page.url(), needsMore: false, screenText: "" };
    }
  }

  await page.locator("#Username, input[name='Username']").first().fill(username);
  await page.locator("#Password, input[name='Password']").first().fill(password);
  await page.locator('button:has-text("Log In to PMI")').first().click();

  await page
    .waitForURL((url) => !url.hostname.includes(IDP_HOST), { timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(5000);

  const ok = !page.url().includes(IDP_HOST);
  const screenText = ok ? "" : await readScreenText(page);

  return {
    ok,
    url: page.url(),
    // 確認コードなど、まだ何か聞かれている気配があるか
    needsMore: !ok && /code|verify|verification|authenticat/i.test(screenText),
    message: ok ? null : await readLoginError(page),
    screenText,
  };
}

// ログイン画面に出るお断りの文言。見つかったらそれだけを伝える。
const LOGIN_ERROR_PHRASES = [
  "do not match",
  "incorrect",
  "locked",
  "disabled",
  "too many",
  "verify",
  "verification",
];

/**
 * ログイン画面に出ているエラー文言だけを拾う。
 *
 * 画面ぜんぶを出すと読みにくいので、肝心の一行を取り出す。
 */
async function readLoginError(page) {
  return await page.evaluate((phrases) => {
    const lines = (document.body.innerText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const hit = lines.filter((l) =>
      phrases.some((p) => l.toLowerCase().includes(p.toLowerCase()))
    );
    return hit.length ? hit.join(" / ") : null;
  }, LOGIN_ERROR_PHRASES);
}

/**
 * 今の画面に出ている文字を読む（何を聞かれているのか知るため）。
 *
 * 切る長さは呼ぶ側で決める。人に見せるだけなら短くてよいが、
 * 数字を拾う用途（readDashboard）で短く切ると、探している行が
 * 切り落とされて「何も見つからない」になってしまう。
 */
export async function readScreenText(page, limit = 800) {
  return await page.evaluate(
    (n) => (document.body.innerText || "").replace(/\n{2,}/g, "\n").trim().slice(0, n),
    limit
  );
}

/**
 * 画面に出ている入力欄のうち、まだ埋まっていないものを1つ探す。
 *
 * 確認コードの入力を求められたときに使う。
 */
export async function findExtraInput(page) {
  return await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter((el) => {
      if (el.type === "hidden" || el.type === "password") return false;
      if (el.value) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (inputs.length !== 1) return null;

    const el = inputs[0];
    return {
      selector: el.id ? `#${el.id}` : el.name ? `input[name="${el.name}"]` : `input[type="${el.type}"]`,
      label: el.placeholder || el.getAttribute("aria-label") || el.name || "",
    };
  });
}

const CREATE_CONTENT_FORM = "https://ccrs.pmi.org/claim/new/CreateContent";

/**
 * 「Create Content」の申請フォームを開く。
 */
export async function openClaimForm(page) {
  await page.goto(CREATE_CONTENT_FORM, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  if (page.url().includes(IDP_HOST)) {
    throw new Error("ログインが切れています。もう一度 login を実行してください。");
  }
  if (!(await page.locator("#ActivityTitle").first().isVisible().catch(() => false))) {
    throw new Error(
      "申請フォームが見つかりませんでした。CCRSの画面の作りが変わった可能性があります。"
    );
  }
  return page.url();
}

/**
 * 申請フォームに中身を入れる。
 *
 * ここでは**送信しない**。入れるところまで。
 * 「正確であることに同意する」のチェックも、送信の直前に別で行う。
 *
 * @param {{organization: string, title: string, description: string,
 *          usDateStarted: string, usDateCompleted: string, pdu: number, url: string}} claim
 */
export async function fillClaimForm(page, claim) {
  await page.locator("#ProviderName").fill(claim.organization);
  await page.locator("#ActivityTitle").fill(claim.title);

  // Description は書式付きの入力欄（Kendo UI のエディタ）。
  // 見えている入力欄は iframe の中にあり、#Description は隠れている。
  // なので iframe の中をクリックしてから文字を流し込む。
  // 送信のときに、Kendo が中身を #Description に写してくれる。
  const editor = page.frameLocator("iframe.k-content").locator("body");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(claim.description);
  await page.waitForTimeout(500);

  if (claim.url) await page.locator("#URL").fill(claim.url);

  await page.locator("#DateStarted").fill(claim.usDateStarted);
  await page.keyboard.press("Escape"); // カレンダーが開いたら閉じる
  await page.locator("#DateCompleted").fill(claim.usDateCompleted);
  await page.keyboard.press("Escape");

  // Create Content は Giving Back の数値ひとつだけ。
  // ここも Kendo の部品（数値入力）で、本体の欄は隠れている。
  // 見えているほうに打つと書式でつまずくので、部品そのものに値を渡す。
  const setPdu = await page.evaluate((value) => {
    const widget = window.jQuery("#PDUValues_0__GiveBack").data("kendoNumericTextBox");
    if (!widget) return false;
    widget.value(value);
    widget.trigger("change");
    return true;
  }, claim.pdu);

  if (!setPdu) {
    // 部品が見つからないときは、見えている入力欄に直接打つ
    await page.locator("input.k-formatted-value, #PDUValues_0__GiveBack").first().fill(String(claim.pdu));
  }

  // CCRSはタイトルを見て、少し遅れて注意書きを出すことがある。
  // 読み返す前に、それが出そろうのを待つ。
  await page.waitForTimeout(3000);
}

/**
 * フォームに実際に入った中身を読み返す。
 *
 * 入れたつもりが入っていない、を防ぐために送信前に必ず確かめる。
 */
export async function readClaimForm(page) {
  return await page.evaluate(() => {
    const val = (id) => document.getElementById(id)?.value ?? "";

    // Description は Kendo のエディタが持っているので、そちらから読む。
    // 隠れている #Description は、送信のときまで空のことがある。
    let description = "";
    try {
      description = window.jQuery("#Description").data("kendoEditor").value() ?? "";
    } catch {
      description = val("Description");
    }

    return {
      organization: val("ProviderName"),
      title: val("ActivityTitle"),
      description: description.replace(/<[^>]*>/g, "").trim(),
      url: val("URL"),
      dateStarted: val("DateStarted"),
      dateCompleted: val("DateCompleted"),
      pdu: val("PDUValues_0__GiveBack"),
      agreed: document.getElementById("ToggleAccept")?.checked ?? false,
      warnings: readWarnings(),
    };

    /**
     * フォームに出ている注意書きを集める。
     *
     * CCRSはタイトルを見て「それは講座のPDUコードがある活動では?」のような
     * 案内を出すことがある。見落とすと申請が差し戻されるので拾っておく。
     */
    function readWarnings() {
      // ページの上のほうにはサイト内検索のフォームもあるので、
      // 「タイトル欄が入っているほう」を申請フォームとして選ぶ。
      const titleField = document.getElementById("ActivityTitle");
      const form = titleField?.closest("form") ?? titleField?.closest("div")?.parentElement;
      if (!form) return [];

      // 注意書きらしい言い回しを含む行だけを拾う。
      // 「同意してください」は送信前に必ず出るので除く。
      const signals =
        /claim code|resubmit|is required|invalid|not valid|cannot|must be|already (been )?(claimed|submitted)/i;

      return [
        ...new Set(
          (form.innerText || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(
              (line) =>
                line &&
                line.length < 200 &&
                signals.test(line) &&
                !/accept the agreement/i.test(line)
            )
        ),
      ];
    }
  });
}

/**
 * 「この申請は正確です」に同意して送信する。＝ここで本当に申請される。
 *
 * PMIの画面には「誤った申請は資格の停止・取り消しにつながる」と書かれている。
 * だから、この関数を呼ぶ前に必ず人の確認を取ること。
 */
export async function submitClaim(page) {
  const agree = page.locator("#ToggleAccept");
  if (!(await agree.isChecked().catch(() => false))) {
    await agree.check();
    await page.waitForTimeout(500);
  }

  // この画面にはサイト内検索のフォームもあるので、申請フォームの中のボタンに限る。
  // ページ全体から探すと、DOMの順しだいで検索の送信ボタンを押してしまう。
  const form = page.locator("form:has(#ActivityTitle)");
  await form.locator('button:has-text("Submit"), input[type="submit"]').first().click();
  await page.waitForTimeout(8000);

  return {
    url: page.url(),
    text: await readScreenText(page),
  };
}

/**
 * ダッシュボードの数字を読む（残りPDU、サイクル、区分ごとの内訳）。
 */
export async function readDashboard(page) {
  await page.goto(CCRS_DASHBOARD, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  // メニューやお知らせが上に長く続くことがあるので、多めに読む
  const text = await readScreenText(page, 8000);
  const pick = (re) => text.match(re)?.[1]?.trim() ?? null;

  return {
    cycle: pick(/Cycle:\s*(.+)/),
    remaining: pick(/([\d.]+)\s*\nPDUs remaining to renew/),
    waysOfWorking: pick(/([\d.]+)\s*Ways of Working/),
    powerSkills: pick(/([\d.]+)\s*Power Skills/),
    businessAcumen: pick(/([\d.]+)\s*Business\s+Acumen/),
    givingBack: pick(/([\d.]+)\s*Other Giving Back/),
    daysLeft: pick(/([\d,]+)\s*\nDays until renewal/),
    raw: text,
  };
}

/** 確認コードなどを入れて送信する。 */
export async function submitExtraInput(page, selector, value) {
  await page.locator(selector).first().fill(value);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(6000);
}
