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
import { stdin, stdout } from "node:process";

import { splitTitleAndBody, markdownToHtml } from "./markdown.mjs";
import {
  openBrowser,
  isLoggedIn,
  openEditor,
  fillTitle,
  fillBody,
  saveDraft,
  PROFILE_DIR,
} from "./note.mjs";

function parseArgs(argv) {
  const args = { command: argv[0] ?? "help", file: null, url: null, title: null, headless: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--headless") args.headless = true;
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

  node src/cli.mjs draft <file.md>
      新しい下書きを作る。Markdownの最初の「# 見出し」がタイトルになる。

  node src/cli.mjs draft <file.md> --url https://note.com/xxx/n/nXXXXXX
      すでにある記事を、このMarkdownの中身で書きかえる。

  node src/cli.mjs probe
      うまく動かない時に、noteの画面の作りを調べて表示する。

オプション:
  --title "好きなタイトル"   Markdownの見出しではなく、これをタイトルにする
  --headless                 ブラウザの画面を出さずに裏で動かす

※このツールは「下書き保存」までしかしません。公開は自分の目で確かめてから、
  noteの画面で「公開」ボタンを押してください。
`);
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
  const html = markdownToHtml(body);

  console.log(`ファイル : ${filePath}`);
  console.log(`タイトル : ${title}`);
  console.log(`本文     : ${body.length} 文字`);
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
      await cmdLogin();
      break;
    case "draft":
      await cmdDraft(args);
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
