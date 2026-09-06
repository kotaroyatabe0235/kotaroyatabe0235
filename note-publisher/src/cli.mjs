#!/usr/bin/env node
// note-publisher の入口。
//
// つかいかた:
//   node src/cli.mjs login                     … 最初に1回だけ。手でログインする
//   node src/cli.mjs draft <file.md>           … 新しい下書きを作る
//   node src/cli.mjs draft <file.md> --url URL … すでにある記事を書きかえる
//   node src/cli.mjs probe                     … 画面の作りを調べる（うまく動かない時用）
//
// 安全のため、このツールは「下書き保存」までしかやらない。公開ボタンは押さない。

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";

import { splitTitleAndBody, markdownToHtml, extractImages } from "./markdown.mjs";
import {
  openBrowser,
  isLoggedIn,
  loginWithPassword,
  findExtraInput,
  submitExtraInput,
  saveShot,
  openEditor,
  fillTitle,
  fillBody,
  insertImages,
  saveDraft,
  readArticleSummary,
  openPublishScreen,
  clickPublish,
  confirmPublished,
  toNoteKey,
  PROFILE_DIR,
} from "./note.mjs";

function parseArgs(argv) {
  const args = {
    command: argv[0] ?? "help",
    file: null,
    url: null,
    title: null,
    headless: false,
    yes: false,
    dryRun: false,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--headless") args.headless = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (!a.startsWith("--")) args.file = a;
  }
  return args;
}

function printHelp() {
  console.log(`
note-publisher — Markdownファイルからnoteの下書きを作る

つかいかた:
  node src/cli.mjs login
      最初に1回だけ実行。ブラウザが開くので、自分の手でnoteにログインする。
      ログインし終わったらターミナルでEnterを押す。次からは不要。

  node src/cli.mjs login --headless
      ブラウザの窓を開けないとき（SSH越し・iPadからの接続など）用。
      メールアドレスとパスワードをこのターミナルで聞いて、裏でログインする。
      入力した内容はファイルには保存しない。

  node src/cli.mjs draft <file.md>
      新しい下書きを作る。Markdownの最初の「# 見出し」がタイトルになる。

  node src/cli.mjs draft <file.md> --url https://note.com/xxx/n/nXXXXXX
      すでにある記事を、このMarkdownの中身で書きかえる。

  node src/cli.mjs publish --url https://note.com/xxx/n/nXXXXXX
      下書きを公開する。中身を読み上げたあと、記事のタイトルを打つと公開される。
      --dry-run を付けると、公開設定の画面まで進んで止まる（公開しない）。

  node src/cli.mjs probe
      うまく動かない時に、noteの画面の作りを調べて表示する。

オプション:
  --title "好きなタイトル"   Markdownの見出しではなく、これをタイトルにする
  --headless                 ブラウザの画面を出さずに裏で動かす
  --dry-run                  publish で、公開の一歩手前まで進んで止まる
  --yes                      publish で、タイトルの打ち込みによる確認を省く

※draft は「下書き保存」までしかしません。公開されるのは publish を実行したときだけです。
`);
}

/** ふつうに聞く（打った文字が見える）。 */
async function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/**
 * パスワードを聞く（打った文字を画面に出さない）。
 *
 * 出力先を「素通ししない書き出し口」に差し替えて、
 * 入力中の文字が画面にもログにも残らないようにしている。
 */
async function askHidden(question) {
  let muted = false;
  const mutedOut = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) stdout.write(chunk, encoding);
      callback();
    },
  });

  const rl = readline.createInterface({
    input: stdin,
    output: mutedOut,
    terminal: true,
  });

  const answered = rl.question(question);
  muted = true;
  const answer = await answered;
  rl.close();
  stdout.write("\n");
  return answer.trim();
}

/**
 * ブラウザの窓を開けない環境（SSH越し・iPadからの接続など）でのログイン。
 *
 * メールアドレスとパスワードをこのターミナルで聞いて、
 * 裏で動くブラウザにそのまま打ち込む。
 * どちらもファイルには保存しない。残るのは .browser-profile/ のログイン状態だけ。
 */
async function cmdLoginHeadless() {
  console.log("画面を出さずにログインします（SSH越しでも使えるやり方）。\n");

  const loginId = await ask("noteのメールアドレス（またはnote ID）: ");
  const password = await askHidden("パスワード（打っても表示されません）: ");

  if (!loginId || !password) {
    console.error("メールアドレスとパスワードの両方が必要です。");
    process.exitCode = 1;
    return;
  }

  const { context, page } = await openBrowser({ headless: true });

  try {
    console.log("\nログインしています…");
    const result = await loginWithPassword(page, { loginId, password });

    if (!result.ok) {
      if (result.message) {
        console.log(`\nnoteの画面にこう出ています: ${result.message}`);
      }

      // 認証コードなど、追加で聞かれている可能性がある
      const extra = await findExtraInput(page);
      if (extra) {
        console.log("\n画面にこう出ています:");
        console.log("----");
        console.log(extra.hint);
        console.log("----");
        const value = await ask("\n上で聞かれている値（認証コードなど）を入れてください: ");
        await submitExtraInput(page, extra.selector, value);
      }
    }

    const ok = await isLoggedIn(page);
    if (ok) {
      console.log("\nログインできました。この状態は次回も使われます。");
      console.log(`保存場所: ${PROFILE_DIR}`);
    } else {
      const shot = await saveShot(page, "login-failed");
      console.log("\nログインできませんでした。");
      console.log(`今の画面の写真: ${shot}`);
      console.log("この写真をClaudeに見せると、原因を調べられます。");
      console.log(
        "「しばらくたってから」と出ている場合は、note側が短時間の再試行を止めています。\n" +
          "10分ほど間をあけてから、もう一度実行してください。"
      );
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

async function cmdLogin() {
  console.log("ブラウザを開きます。noteにログインしてください。");
  const { context, page } = await openBrowser({ headless: false });

  await page.goto("https://note.com/login", { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question(
    "\nログインが終わったら、このターミナルで Enter を押してください… "
  );
  rl.close();

  const ok = await isLoggedIn(page);
  await context.close();

  if (ok) {
    console.log("\nログインを確認しました。この状態は次回も使われます。");
    console.log(`保存場所: ${PROFILE_DIR}`);
  } else {
    console.log(
      "\nまだログインできていないようです。もう一度 login を実行してみてください。"
    );
    process.exitCode = 1;
  }
}

async function cmdDraft(args) {
  if (!args.file) {
    console.error("Markdownファイルを指定してください。");
    console.error("例: node src/cli.mjs draft ~/memo/kiji.md");
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(args.file);
  const markdown = await fs.readFile(filePath, "utf-8");

  // タイトルと本文に切り分ける
  const { title: h1Title, body } = splitTitleAndBody(markdown);
  const title = args.title ?? h1Title ?? path.basename(filePath, ".md");

  // 画像の行は先に抜き出して「目印」に置きかえる。
  // 本文を入れ終わったあとで、目印を1枚ずつ画像に入れ替える。
  const { markdown: bodyWithMarkers, images } = extractImages(body, path.dirname(filePath));
  const html = markdownToHtml(bodyWithMarkers);

  // 使える画像（このパソコンにあって、実際に読めるもの）だけ残す
  const usable = [];
  for (const image of images) {
    if (!image.filePath) {
      console.log(`⚠ ネット上の画像はそのままにしました: ${image.src}`);
      continue;
    }
    try {
      await fs.access(image.filePath);
      usable.push(image);
    } catch {
      console.log(`⚠ 画像が見つかりません: ${image.filePath}`);
    }
  }

  console.log(`ファイル : ${filePath}`);
  console.log(`タイトル : ${title}`);
  console.log(`本文     : ${body.length} 文字`);
  console.log(`画像     : ${usable.length} 枚`);
  console.log(args.url ? `書きかえ : ${args.url}` : "新しい下書きを作ります");
  console.log("");

  const { context, page } = await openBrowser({ headless: args.headless });

  try {
    if (!(await isLoggedIn(page))) {
      console.error(
        "noteにログインしていません。先に `node src/cli.mjs login` を実行してください。"
      );
      process.exitCode = 1;
      return;
    }

    const editorUrl = await openEditor(page, args.url);
    console.log(`エディタを開きました: ${editorUrl}`);

    await fillTitle(page, title);
    console.log("タイトルを入れました");

    await fillBody(page, html);
    console.log("本文を入れました");

    if (usable.length > 0) {
      console.log(`画像を入れています（${usable.length}枚）…`);
      const results = await insertImages(page, usable);
      for (const [i, r] of results.entries()) {
        const name = path.basename(usable[i].filePath);
        console.log(r.ok ? `  ${name} … 入りました` : `  ${name} … 入りませんでした（${r.reason}）`);
      }
    }

    const saved = await saveDraft(page);
    if (saved) {
      console.log("下書きとして保存しました");
    } else {
      console.log(
        "「下書き保存」ボタンが見つかりませんでした（noteは自動保存されることがあります）。\n" +
          "ブラウザの画面で保存されているか確認してください。"
      );
    }

    console.log(`\n記事の編集画面: ${page.url()}`);
    console.log("内容を自分の目で確かめて、よければnoteの画面で「公開」を押してください。");

    if (!args.headless) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      await rl.question("\n確認が終わったら Enter を押すとブラウザを閉じます… ");
      rl.close();
    }
  } finally {
    await context.close();
  }
}

/**
 * 記事を公開する。
 *
 * このツールで唯一「取り消しがきかない」操作なので、条件を厳しくしてある。
 *   - 記事のURLを必ず指定する（間違えて別の記事を公開しないため）
 *   - 中身を読み上げてから確かめる
 *   - --yes が無ければ、記事のタイトルを打ってもらうまで進まない
 *   - --dry-run なら公開設定の画面まで進んで、そこで止まる
 *   - draft コマンドからは絶対に呼ばれない
 */
async function cmdPublish(args) {
  if (!args.url) {
    console.error("公開する記事のURLを指定してください。");
    console.error("例: node src/cli.mjs publish --url https://note.com/xxx/n/nXXXXXX");
    process.exitCode = 1;
    return;
  }

  const noteKey = toNoteKey(args.url);
  const { context, page } = await openBrowser({ headless: args.headless });

  try {
    if (!(await isLoggedIn(page))) {
      console.error("noteにログインしていません。先に login を実行してください。");
      process.exitCode = 1;
      return;
    }

    // いま公開済みかどうかを先に見る
    const before = await confirmPublished(page, noteKey);
    if (before.published) {
      console.log("この記事はすでに公開されています。何もしませんでした。");
      console.log(`記事: ${before.url}`);
      return;
    }

    await openEditor(page, args.url);
    const summary = await readArticleSummary(page);

    if (!summary.title || summary.textLength === 0) {
      console.error("タイトルか本文が空です。念のため公開をやめました。");
      process.exitCode = 1;
      return;
    }

    console.log("これから公開する記事:");
    console.log(`  タイトル : ${summary.title}`);
    console.log(`  本文     : ${summary.textLength} 文字（${summary.blocks} かたまり）`);
    console.log(`  画像     : ${summary.images} 枚`);
    console.log(`  書き出し : ${summary.head}…`);
    console.log("");

    await openPublishScreen(page);
    console.log("公開設定の画面まで進みました。ここまでは、まだ下書きのままです。");

    if (args.dryRun) {
      console.log("\n--dry-run なので、ここで止めます。公開はしていません。");
      return;
    }

    if (!args.yes) {
      console.log("\n本当に公開する場合は、記事のタイトルをそのまま打ってください。");
      console.log("（やめる場合は、何も打たずに Enter）");
      const typed = await ask("タイトル: ");
      if (typed !== summary.title) {
        console.log("タイトルが一致しませんでした。公開はしていません。");
        process.exitCode = 1;
        return;
      }
    }

    console.log("\n公開します…");
    await clickPublish(page);

    const after = await confirmPublished(page, noteKey);
    if (after.published) {
      console.log("公開しました。");
      console.log(`記事: ${after.url}`);
    } else {
      const shot = await saveShot(page, "publish-result");
      console.log(`公開できたか確かめられませんでした（今の状態: ${after.status ?? "不明"}）。`);
      console.log(`今の画面の写真: ${shot}`);
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

async function cmdProbe() {
  console.log("noteの新規記事画面を開いて、画面の作りを調べます…\n");
  const { context, page } = await openBrowser({ headless: false });

  try {
    if (!(await isLoggedIn(page))) {
      console.error("先に `node src/cli.mjs login` でログインしてください。");
      process.exitCode = 1;
      return;
    }

    await openEditor(page, null);

    // 入力できそうな部品を全部さがして表示する
    const info = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const push = (kind, el) => {
        const desc = {
          kind,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: (el.className || "").toString().slice(0, 120) || null,
          placeholder: el.getAttribute("placeholder"),
          testid: el.getAttribute("data-testid"),
          ariaLabel: el.getAttribute("aria-label"),
        };
        const key = JSON.stringify(desc);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(desc);
        }
      };

      document.querySelectorAll("textarea, input[type=text]").forEach((el) => push("入力欄", el));
      document.querySelectorAll('[contenteditable="true"]').forEach((el) => push("本文欄", el));
      document.querySelectorAll("button").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t) push(`ボタン(${t.slice(0, 20)})`, el);
      });
      return out;
    });

    console.log(JSON.stringify(info, null, 2));
    console.log(
      "\nこの内容を Claude に見せると、目印（セレクタ）を直せます。"
    );

    const rl = readline.createInterface({ input: stdin, output: stdout });
    await rl.question("\nEnter を押すとブラウザを閉じます… ");
    rl.close();
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case "login":
      if (args.headless) await cmdLoginHeadless();
      else await cmdLogin();
      break;
    case "draft":
      await cmdDraft(args);
      break;
    case "publish":
      await cmdPublish(args);
      break;
    case "probe":
      await cmdProbe();
      break;
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error("\nエラーが起きました:");
  console.error(err.message);
  process.exitCode = 1;
});
