#!/usr/bin/env node
// pdu-claimer の入口。
//
// つかいかた:
//   node src/cli.mjs login --headless        … 最初に1回。PMIにログインする
//   node src/cli.mjs prepare <note記事URL>   … 申請に書く内容を組み立てて見せる
//   node src/cli.mjs list                    … これまでの申請（台帳）を見る
//
// 申請の送信（submit）は、PMIにログインできることを確かめてから作る。

import path from "node:path";
import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";

import { fetchArticle } from "./article.mjs";
import { buildClaim, toUsDate, DEFAULT_HOURS } from "./claim.mjs";
import {
  readLedger,
  addClaim,
  findClaim,
  summarize,
  LEDGER_FILE,
  GIVING_BACK_MAX,
} from "./ledger.mjs";
import {
  openBrowser,
  isLoggedIn,
  loginWithPassword,
  findExtraInput,
  submitExtraInput,
  openClaimForm,
  fillClaimForm,
  readClaimForm,
  submitClaim,
  readDashboard,
  saveShot,
  PROFILE_DIR,
} from "./ccrs.mjs";

function parseArgs(argv) {
  const args = {
    command: argv[0] ?? "help",
    url: null,
    hours: null,
    headless: false,
    yes: false,
    dryRun: false,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    // PDU数はユーザーの申告がすべて。値がおかしいときに黙って既定値へ落とすと、
    // 「3時間のつもりが2PDUで申請されていた」が起きる。だからここで止める。
    if (a === "--hours") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--hours には0より大きい数を指定してください（受け取った値: ${raw}）`);
      }
      args.hours = n;
    }
    else if (a === "--headless") args.headless = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (!a.startsWith("--")) args.url = a;
  }
  return args;
}

function printHelp() {
  console.log(`
pdu-claimer — 公開したnote記事を、PMPのPDUとして申請するための道具

つかいかた:
  node src/cli.mjs login --headless
      PMIにログインする。ユーザー名とパスワードをこのターミナルで聞く。
      入力した内容はファイルには保存しない。次回からは不要。

  node src/cli.mjs prepare https://note.com/xxx/n/nXXXXXX
      公開済みの記事から、CCRSの入力欄に入れる内容を組み立てて表示する。
      PMIにはつながないので、これだけなら何も起きない。

  node src/cli.mjs submit https://note.com/xxx/n/nXXXXXX --hours 3
      CCRSの申請フォームに入れて送信する。送信の前に中身を読み上げ、
      「agree <PDU数>」と打つまで送信しない。
      --dry-run を付けると、入れるところまでで止まる（申請しない）。

  node src/cli.mjs status
      PMPの今の状態（残りPDU・区分ごとの内訳）をCCRSから読む。

  node src/cli.mjs list
      これまでにこのツールで申請した記録（台帳）を見る。

オプション:
  --hours 3     この記事にかけた時間（1時間 = 1PDU）。既定は ${DEFAULT_HOURS}
  --headless    ブラウザの画面を出さずに裏で動かす
  --dry-run     submit で、送信の一歩手前まで進んで止まる
  --yes         submit で、打ち込みによる確認を省く

※PDUの申請はPMIの監査の対象です。時間は「実際にかけた時間」を入れてください。
`);
}

/** ふつうに聞く（打った文字が見える）。 */
async function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** パスワードを聞く（打った文字を画面に出さない）。 */
async function askHidden(question) {
  let muted = false;
  const mutedOut = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) stdout.write(chunk, encoding);
      callback();
    },
  });

  const rl = readline.createInterface({ input: stdin, output: mutedOut, terminal: true });
  const answered = rl.question(question);
  muted = true;
  const answer = await answered;
  rl.close();
  stdout.write("\n");
  return answer.trim();
}

async function cmdLogin(args) {
  console.log("PMI（ccrs.pmi.org）にログインします。\n");

  const username = await ask("PMIのユーザー名（またはメールアドレス）: ");
  const password = await askHidden("パスワード（打っても表示されません）: ");

  if (!username || !password) {
    console.error("ユーザー名とパスワードの両方が必要です。");
    process.exitCode = 1;
    return;
  }

  const { context, page } = await openBrowser({ headless: args.headless });

  try {
    console.log("\nログインしています…");
    const result = await loginWithPassword(page, { username, password });

    if (!result.ok) {
      if (result.message) {
        console.log(`\nPMIの画面にこう出ています: ${result.message}`);
      }

      // 確認コードなど、追加で聞かれているときだけ聞き返す
      const extra = result.needsMore ? await findExtraInput(page) : null;
      if (extra) {
        const value = await ask(`\n「${extra.label || "入力欄"}」に入れる値を打ってください: `);
        await submitExtraInput(page, extra.selector, value);
      }
    }

    if (await isLoggedIn(page)) {
      console.log("\nログインできました。この状態は次回も使われます。");
      console.log(`保存場所: ${PROFILE_DIR}`);
    } else {
      const shot = await saveShot(page, "login-failed");
      console.log("\nログインできませんでした。");
      if (/do not match|incorrect/i.test(result.message ?? "")) {
        console.log(
          "\nユーザー名かパスワードが違います。次のどれかが多いです。\n" +
            "  ・PMIは「ユーザー名」でのログイン。メールアドレスと別のことがある\n" +
            "  ・Google / Apple / LinkedIn でPMIに登録していて、そもそもパスワードが無い\n" +
            "  ・パスワードを忘れている\n" +
            "何度も試すとアカウントがロックされます。2回外したら " +
            "https://idp.pmi.org/ の Forgot Username / Forgot Password を使ってください。"
        );
      }
      console.log(`\n画面の写真: ${shot}`);
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

async function cmdPrepare(args) {
  if (!args.url) {
    console.error("noteの記事URLを指定してください。");
    console.error("例: node src/cli.mjs prepare https://note.com/xxx/n/nXXXXXX");
    process.exitCode = 1;
    return;
  }

  const article = await fetchArticle(args.url);

  if (!article.isPublished) {
    console.error("この記事はまだ公開されていません。公開してから申請してください。");
    process.exitCode = 1;
    return;
  }

  const already = await findClaim(article.key);
  if (already) {
    console.log("⚠ この記事は台帳にすでにあります（二重申請に注意）。");
    console.log(`   ${already.submittedAt} に ${already.pdu} PDU で ${already.status}`);
    console.log("");
  }

  const claim = buildClaim(article, { hours: args.hours });

  console.log("CCRSの入力欄に、これをそのまま入れてください。");
  console.log("");
  console.log(`  Category            : ${claim.category}`);
  console.log(`  Title               : ${claim.title}`);
  console.log(`  Description         : ${claim.description}`);
  console.log(`  Date Started        : ${claim.dateStarted}`);
  console.log(`  Date Completed      : ${claim.dateCompleted}`);
  console.log(`  PDUs Claimed        : ${claim.pdu}`);
  console.log(`  Talent Triangle     : ${claim.talentTriangle}`);
  console.log(`  URL                 : ${claim.url}`);
  console.log("");
  console.log("※ PDUは「実際にかけた時間」で申請してください（1時間=1PDU）。");
  console.log(`   時間を変えるときは --hours で指定します（今は ${claim.pdu} 時間）。`);

  const ledger = await readLedger();
  const total = summarize(ledger);
  console.log("");
  console.log(
    `台帳の合計: ${total.totalPdu} PDU / Giving Back の上限 ${GIVING_BACK_MAX} PDU` +
      `（残り ${total.givingBackLeft}）`
  );
}

/**
 * PDUを申請する（CCRSに送信する）。
 *
 * このツールで唯一「取り消しがきかない」操作。しかもPMIの監査の対象なので、
 * 条件を厳しくしてある。
 *   - 記事のURLを必ず指定する
 *   - 台帳にすでにあれば止まる（二重申請の防止）
 *   - フォームに入れた中身を読み返して見せる
 *   - --yes が無ければ「agree <PDU数>」と打ってもらうまで送信しない
 *   - --dry-run なら入れるところまでで止まる
 */
async function cmdSubmit(args) {
  if (!args.url) {
    console.error("noteの記事URLを指定してください。");
    console.error("例: node src/cli.mjs submit https://note.com/xxx/n/nXXXXXX --hours 3");
    process.exitCode = 1;
    return;
  }

  const article = await fetchArticle(args.url);
  if (!article.isPublished) {
    console.error("この記事はまだ公開されていません。公開してから申請してください。");
    process.exitCode = 1;
    return;
  }

  const already = await findClaim(article.key);
  if (already) {
    if (already.status === "submitted") {
      console.error("この記事はすでに申請済みです（台帳にあります）。二重申請を避けるため中止します。");
      console.error(`  ${already.submittedAt} に ${already.pdu} PDU`);
      process.exitCode = 1;
      return;
    }

    // status が unknown＝「送ったが通ったか確かめられなかった」。
    // PMI側では受理されていることがあるので、黙って進むと二重申請になる。
    console.log(
      `⚠ この記事は ${already.submittedAt} に ${already.pdu} PDU で申請を試みた記録があります（status: ${already.status}）。`
    );
    console.log("  CCRSの Claim History に入っていないことを確かめてから進めてください。\n");
  }

  const claim = buildClaim(article, { hours: args.hours });
  const formValues = {
    ...claim,
    usDateStarted: toUsDate(claim.dateStarted),
    usDateCompleted: toUsDate(claim.dateCompleted),
  };

  const { context, page } = await openBrowser({ headless: args.headless });

  try {
    if (!(await isLoggedIn(page))) {
      console.error("PMIにログインしていません。先に login を実行してください。");
      process.exitCode = 1;
      return;
    }

    await openClaimForm(page);
    await fillClaimForm(page, formValues);

    // 入れたつもりが入っていない、を防ぐために読み返す
    const filled = await readClaimForm(page);
    console.log("フォームに入った中身:");
    console.log(`  Organization   : ${filled.organization}`);
    console.log(`  Title          : ${filled.title}`);
    console.log(`  Date Started   : ${filled.dateStarted}`);
    console.log(`  Date Completed : ${filled.dateCompleted}`);
    console.log(`  PDUs Claimed   : ${filled.pdu}`);
    console.log(`  URL            : ${filled.url}`);
    console.log(`  Description    : ${filled.description.slice(0, 100)}…`);
    console.log("");

    if (filled.warnings.length > 0) {
      console.log("CCRSの画面に、こんな注意書きが出ています:");
      for (const w of filled.warnings) console.log(`  ⚠ ${w}`);
      console.log("");
    }

    // Description は iframe に打ち込む都合で一番失敗しやすい。
    // 空のまま申請すると、監査のときに「何をしたのか」を示すものが無くなる。
    const missing = [];
    if (!filled.title) missing.push("Title");
    if (!filled.description) missing.push("Description");
    if (!filled.url) missing.push("URL");
    if (!filled.dateStarted) missing.push("Date Started");
    if (!filled.dateCompleted) missing.push("Date Completed");
    if (!filled.pdu) missing.push("PDUs Claimed");
    if (missing.length > 0) {
      const shot = await saveShot(page, "claim-form-incomplete");
      console.error(`入りきらなかった欄があります: ${missing.join(", ")}`);
      console.error(`画面の写真: ${shot}`);
      process.exitCode = 1;
      return;
    }

    if (args.dryRun) {
      const shot = await saveShot(page, "claim-form-dryrun");
      console.log("--dry-run なので、ここで止めます。申請はしていません。");
      console.log(`画面の写真: ${shot}`);
      return;
    }

    if (!args.yes) {
      console.log("PMIの画面にはこう書かれています:");
      console.log("  「誤った申請は、資格の停止や取り消しにつながることがあります」");
      console.log("");
      console.log(`申請する時間は ${filled.pdu} 時間（${filled.pdu} PDU）です。`);
      console.log("これが実際にかけた時間として正しいなら、");
      console.log(`「agree ${filled.pdu}」と打ってください。（やめる場合はそのまま Enter）`);
      const typed = await ask("> ");
      if (typed !== `agree ${filled.pdu}`) {
        console.log("確認が取れませんでした。申請はしていません。");
        process.exitCode = 1;
        return;
      }
    }

    console.log("\n申請しています…");
    const result = await submitClaim(page);

    // 「Claim History」はページ上部のメニューにも出るので、成功のしるしには使えない。
    // 申請フォームのページから離れたか、も合わせて見る。
    const leftForm = !result.url.includes("/claim/new/");
    const succeeded = leftForm && /submitted|success|thank you/i.test(result.text);
    const shot = await saveShot(page, "claim-result");

    await addClaim({
      noteKey: claim.noteKey,
      title: claim.title,
      articleUrl: claim.url,
      publishedAt: claim.dateStarted,
      pdu: claim.pdu,
      category: claim.category,
      submittedAt: new Date().toISOString().slice(0, 10),
      status: succeeded ? "submitted" : "unknown",
    });

    if (succeeded) {
      console.log("申請しました。台帳にも記録しました。");
    } else {
      console.log("申請できたか確かめられませんでした。台帳には unknown で記録しています。");
      console.log("CCRSの Claim History を見て、実際に入っているか確かめてください。");
    }
    console.log(`今の画面: ${result.url}`);
    console.log(`画面の写真: ${shot}`);
  } finally {
    await context.close();
  }
}

/** CCRSのダッシュボードの数字を見る。 */
async function cmdStatus(args) {
  const { context, page } = await openBrowser({ headless: args.headless });

  try {
    if (!(await isLoggedIn(page))) {
      console.error("PMIにログインしていません。先に login を実行してください。");
      process.exitCode = 1;
      return;
    }

    const d = await readDashboard(page);
    console.log("PMPの今の状態:");
    console.log(`  サイクル          : ${d.cycle ?? "不明"}`);
    console.log(`  更新まで          : ${d.daysLeft ?? "?"} 日`);
    console.log(`  残りPDU           : ${d.remaining ?? "?"}`);
    console.log("");
    console.log("  Education（最低35）");
    console.log(`    Ways of Working : ${d.waysOfWorking ?? "?"} （最低8）`);
    console.log(`    Power Skills    : ${d.powerSkills ?? "?"} （最低8）`);
    console.log(`    Business Acumen : ${d.businessAcumen ?? "?"} （最低8）`);
    console.log("  Giving Back（最大25）");
    console.log(`    Other Giving Back: ${d.givingBack ?? "?"}`);

    // 最低ラインに届いていない区分があれば知らせる
    const short = [
      ["Ways of Working", d.waysOfWorking],
      ["Power Skills", d.powerSkills],
      ["Business Acumen", d.businessAcumen],
    ].filter(([, v]) => v !== null && Number(v) < 8);

    if (short.length > 0) {
      console.log("");
      for (const [name, v] of short) {
        console.log(`⚠ ${name} が ${v}。最低の8にあと ${(8 - Number(v)).toFixed(2)} 足りません。`);
      }
      console.log("  この不足は記事（Giving Back）では埋められません。Educationで埋める必要があります。");
    }
  } finally {
    await context.close();
  }
}

async function cmdList() {
  const ledger = await readLedger();
  const total = summarize(ledger);

  if (ledger.claims.length === 0) {
    console.log("まだ申請の記録はありません。");
    console.log(`台帳の場所: ${LEDGER_FILE}`);
    return;
  }

  console.log("これまでの申請:");
  for (const c of ledger.claims) {
    console.log(`  ${c.submittedAt}  ${String(c.pdu).padStart(2)} PDU  ${c.status}  ${c.title}`);
    console.log(`      ${c.articleUrl}`);
  }
  console.log("");
  // 合計に入るのは status が submitted の分だけ。
  // 上の一覧は unknown も出すので、断りを入れないと件数が合わなく見える。
  const unknownCount = ledger.claims.length - total.count;
  console.log(`合計: ${total.count} 件 / ${total.totalPdu} PDU（確認できた分だけ）`);
  if (unknownCount > 0) {
    console.log(
      `  ほかに、通ったか確かめられていない申請が ${unknownCount} 件あります（合計には入れていません）。`
    );
  }
  console.log(`Giving Back の上限 ${GIVING_BACK_MAX} PDU に対して、残り ${total.givingBackLeft} PDU`);
  if (total.overGivingBack) {
    console.log("⚠ Giving Back の上限を超えています。超えた分は数えられません。");
  }
  console.log("");
  console.log("※ ここに出るのは、このツールで申請した分だけです。");
  console.log("   研修や読書など、CCRSの画面で直接申請した分は入っていません。");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case "login":
      await cmdLogin(args);
      break;
    case "prepare":
      await cmdPrepare(args);
      break;
    case "submit":
      await cmdSubmit(args);
      break;
    case "status":
      await cmdStatus(args);
      break;
    case "list":
      await cmdList();
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
