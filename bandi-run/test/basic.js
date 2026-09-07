
/* ================= ここから検証ドライバ ================= */
const D = globalThis.__driver();
function step(n, ms) {
  for (let i = 0; i < n; i++) { D.tick(ms || 16.7); D.frame(performance.now()); }
}

// 1) 何もせず 30 フレーム：地面の上で止まっているか
restart();
step(30);
const bad = (v) => !Number.isFinite(v);
if (bad(P.x) || bad(P.y) || bad(P.z)) throw new Error('NaN position: ' + JSON.stringify(P));
console.log('idle  -> y=' + P.y.toFixed(3) + ' onGround=' + P.onGround + ' (期待 y≈0.75, true)');
console.log('箱の合計 crateTotal=' + crateTotal + ' / くだもの ' + fruits.length + 'こ / 敵 ' + enemies.length + '匹 / 床 ' + solids.length);

// 2) ジャンプの高さを測る
restart(); step(20);
const y0 = P.y; let peak = -99;
input.jumpPressed = true; keys.Space = true;
for (let i = 0; i < 90; i++) { D.tick(16.7); D.frame(performance.now()); peak = Math.max(peak, P.y); }
keys.Space = false;
console.log('jump  -> 高さ ' + (peak - y0).toFixed(2) + ' マス（箱1個=1マス。2以上あれば箱に乗れる）');

// 3) 前へ走り続けるボット。どこまで進めるか＋落ちないか
restart();
let maxZ = -99, deaths = 0, prevLives = lives, frames = 0, err = null;
keys.ArrowUp = true;
try {
  for (let i = 0; i < 60 * 90; i++) {   // 90秒ぶん
    frames++;
    // 0.45秒ごとにジャンプ、たまにスピン
    if (i % 27 === 0) input.jumpPressed = true;
    keys.Space = (i % 27) < 12;
    keys.KeyX = (i % 90) < 8;
    D.tick(16.7); D.frame(performance.now());
    if (lives < prevLives) { deaths++; prevLives = lives; }
    maxZ = Math.max(maxZ, P.z);
    if (bad(P.x) || bad(P.y) || bad(P.z)) throw new Error('NaN at frame ' + i);
    if (state === 'gameover' || state === 'win') break;
  }
} catch (e) { err = e; }
console.log('bot   -> 到達 z=' + maxZ.toFixed(1) + ' / ゴール z=' + goal.z + ' / 状態=' + state +
  ' / ミス' + deaths + '回 / くだもの' + fruitCount + ' / 箱' + crateCount + '/' + crateTotal);
console.log('draw calls (1フレーム分の目安) = ' + Math.round(D.drawCalls() / frames));
if (err) { console.log('!! 例外: ' + err.stack); process.exit(1); }
console.log('OK: 例外なしで ' + frames + ' フレーム走りました');

// 4) バウンド箱：上に落ちたら、その上のくだものに届く高さまではね上がるか
//    （onLandOn() を通る唯一のテスト。ここが無いと箱の不具合がすり抜ける）
restart();
for (const k of Object.keys(keys)) keys[k] = false;
touchVec.x = 0; touchVec.z = 0;
const BOUNCE = { x: 1.5, z: 74, top: 2.8 };   // crate(1.5,1.8,74,'bounce') の上の面
const TOP_FRUIT_Y = 7.6;                      // fruit(1.5,7.6,76)
P.x = BOUNCE.x; P.z = BOUNCE.z; P.y = BOUNCE.top + P.hy + 2;
P.vx = P.vy = P.vz = 0; P.onGround = false; P.ground = null;
// ボタンを離すと追加の重力がかかる（低いジャンプ）ので、実際の操作どおり押しっぱなしにする
keys.Space = true;
let bPeak = -99, bounces = 0, wasSlow = true;
for (let i = 0; i < 300; i++) {
  D.tick(16.7); D.frame(performance.now());
  bPeak = Math.max(bPeak, P.y);
  // 箱の上に落ちるたび vy が大きく上向きになる。押しっぱなしでもジャンプは出ないので、
  // これが立つのはバウンド箱に当たったときだけ
  if (P.vy > 18 && wasSlow) bounces++;
  wasSlow = P.vy <= 18;
}
console.log('bounce-> 最高点 y=' + bPeak.toFixed(2) + ' / 上のくだもの y=' + TOP_FRUIT_Y +
  ' / はね返った回数=' + bounces);
if (bPeak < TOP_FRUIT_Y) {
  console.log('!! バウンド箱ではね上がれていません（上のくだものに届かない）');
  process.exit(1);
}
if (bounces < 2) {
  console.log('!! 箱の上で固まっています（落ちてもはね返らない）');
  process.exit(1);
}
console.log('OK: バウンド箱ではね上がって、上のくだものに届きました');
