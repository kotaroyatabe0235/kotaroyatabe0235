
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
