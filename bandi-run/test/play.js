
/* ============ 自動プレイ：ステージを最後までクリアできるか確かめる ============ */
const D = globalThis.__driver();
restart();
lives = 999;
const cl = (v, a, b) => v < a ? a : (v > b ? b : v);
const way = solids.filter(s => s.kind === 'plat' || s.kind === 'mover').sort((a, b) => a.z - b.z);
let deaths = 0, prevLives = lives, stuck = 0, lastZ = 0, log = [];

for (let i = 0; i < 60 * 400; i++) {
  // 今いる場所より先にある足場のうち、いちばん手前のものを目標にする
  let idx = way.findIndex(s => s.z + s.hz > P.z + 1.0);
  if (idx < 0) idx = way.length - 1;
  if (way[idx] === P.ground && idx < way.length - 1) idx++;
  const t = way[idx];
  const dz = t.z - P.z, dx = t.x - P.x;
  const cur = P.ground;
  const onEdge = cur && (P.z + 1.5 > cur.z + cur.hz);

  // 前に進む力を落とさないよう、横入力はひかえめに
  let wantX = cl(dx * 0.8, -0.55, 0.55);
  let wantZ = 1;
  // 動く足場へ跳ぶときは、はしまで来てから、届く位置に来るのを待つ
  if (t.kind === 'mover' && onEdge && (t.z - t.hz - P.z > 3.2 || Math.abs(dx) > 1.2)) {
    wantZ = 0; wantX = cl(dx * 0.5, -1, 1);
  }
  touchVec.x = wantX; touchVec.z = wantZ;
  const needUp = t.y + t.hy > P.y - P.hy + 0.3;
  if (P.onGround && wantZ > 0 && (onEdge || (needUp && dz < 3.0))) input.jumpPressed = true;
  keys.Space = true;

  D.tick(16.7); D.frame(performance.now());

  if (lives < prevLives) {
    deaths++; if (deaths <= 10) log.push('  やられ#' + deaths + ' 目標z=' + t.z.toFixed(1) + '(' + t.kind + ')');
    prevLives = lives = 999;
  }
  if (state === 'win') break;
  stuck = Math.abs(P.z - lastZ) < 0.02 ? stuck + 1 : 0;
  lastZ = P.z;
  if (stuck > 60 * 25) { log.push('  z=' + P.z.toFixed(1) + ' で動けなくなりました'); break; }
}
log.forEach(l => console.log(l));
console.log('自動プレイ -> 状態=' + state + ' / z=' + P.z.toFixed(1) +
  ' / やられ ' + deaths + '回 / くだもの ' + fruitCount + ' / 箱 ' + crateCount + '/' + crateTotal +
  ' / タイム ' + timeSec.toFixed(0) + '秒');
console.log(state === 'win' ? 'ゴールまで到達できました ✅' : 'ゴールできず ❌');
if (state !== 'win') process.exit(1);
