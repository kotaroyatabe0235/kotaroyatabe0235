// 申請の台帳（だいちょう＝記録帳）をあつかうファイル。
//
// どの記事を、いつ、何PDUで申請したかを1つのファイルに残しておく。
// これで「同じ記事を二重に申請してしまう」事故を防げる。
//
// 置き場所は .data/claims.json。個人の資格の記録なのでコミットしない。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(__dirname, "..", ".data");
export const LEDGER_FILE = path.join(DATA_DIR, "claims.json");

// PMPの決まり（3年ごとのサイクル）
// 参考: PMI「Continuing Certification Requirements」
export const PMP_TOTAL_PDU = 60; // 3年で必要な合計
export const GIVING_BACK_MAX = 25; // そのうち Giving Back で数えられる上限

/**
 * 台帳を読む。まだ無ければ空の台帳を返す。
 */
export async function readLedger() {
  try {
    const text = await fs.readFile(LEDGER_FILE, "utf-8");
    const data = JSON.parse(text);
    return { claims: [], ...data };
  } catch {
    return { claims: [] };
  }
}

/**
 * 台帳に1件書き足す。
 *
 * @param {{noteKey: string, title: string, articleUrl: string, publishedAt: string,
 *          pdu: number, category: string, submittedAt: string, status: string,
 *          talentTriangle: string}} claim
 */
export async function addClaim(claim) {
  const ledger = await readLedger();
  ledger.claims.push(claim);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
  return ledger;
}

/**
 * その記事がもう申請済みかどうかを調べる。
 */
export async function findClaim(noteKey) {
  const ledger = await readLedger();
  return ledger.claims.find((c) => c.noteKey === noteKey) ?? null;
}

/**
 * 台帳の合計を出す。
 *
 * ここで数えられるのは「このツールで申請した分」だけ。
 * 研修や読書など、CCRSの画面で直接申請した分は入っていない。
 */
export function summarize(ledger) {
  const done = ledger.claims.filter((c) => c.status === "submitted");
  const total = done.reduce((sum, c) => sum + Number(c.pdu || 0), 0);
  return {
    count: done.length,
    totalPdu: total,
    givingBackLeft: Math.max(0, GIVING_BACK_MAX - total),
    overGivingBack: total > GIVING_BACK_MAX,
  };
}
