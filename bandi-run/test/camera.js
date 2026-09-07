
/* ============ カメラの行列が正しいか、数値で確かめる ============ */
function project(px, py, pz) {
  const mvp = mat4(), pv = mat4();
  mul(proj, view, pv);
  const x = pv[0]*px + pv[4]*py + pv[8]*pz + pv[12];
  const y = pv[1]*px + pv[5]*py + pv[9]*pz + pv[13];
  const z = pv[2]*px + pv[6]*py + pv[10]*pz + pv[14];
  const w = pv[3]*px + pv[7]*py + pv[11]*pz + pv[15];
  return { x: x/w, y: y/w, z: z/w, w };
}
restart();
const D2 = globalThis.__driver();
for (let i = 0; i < 60; i++) { D2.tick(16.7); D2.frame(performance.now()); }

const me = project(P.x, P.y, P.z);
const ahead = project(P.x, P.y, P.z + 20);
const behind = project(P.x, P.y, P.z - 30);     // カメラの後ろ
const right = project(P.x + 5, P.y, P.z);        // ワールド +x
const below = project(P.x, P.y - 3, P.z);

const ok = [];
ok.push(['主人公が画面のほぼ中央', Math.abs(me.x) < 0.25 && Math.abs(me.y) < 0.5, me]);
ok.push(['主人公はカメラの前(w>0)', me.w > 0, me.w.toFixed(2)]);
ok.push(['遠くのものは中央に寄る', Math.abs(ahead.x) <= Math.abs(me.x) + 0.05, ahead]);
ok.push(['カメラの後ろは w<0', behind.w < 0, behind.w.toFixed(2)]);
ok.push(['ワールド +x は画面の左(-)', right.x < me.x, right.x.toFixed(2)]);
ok.push(['下にあるものは画面の下(-)', below.y < me.y, below.y.toFixed(2)]);
// 立方体の面の向き（法線）が外向きか：+x 面の頂点の法線が (1,0,0)
const cv = cubeVerts();
let normalsOk = true;
for (let i = 0; i < cv.length; i += 6) {
  const px2 = cv[i], nx = cv[i+3], ny = cv[i+4], nz = cv[i+5];
  if (Math.abs(Math.hypot(nx, ny, nz) - 1) > 1e-6) normalsOk = false;
  // 頂点は法線の向きに 0.5 ずれているはず
  if (Math.abs(cv[i]*nx + cv[i+1]*ny + cv[i+2]*nz - 0.5) > 1e-6) normalsOk = false;
}
ok.push(['立方体の法線が外向き', normalsOk, '']);

let fail = 0;
for (const [name, pass, info] of ok) {
  console.log((pass ? 'OK  ' : 'NG  ') + name + '   ' + (typeof info === 'object' ? `x=${info.x.toFixed(2)} y=${info.y.toFixed(2)}` : info));
  if (!pass) fail++;
}
console.log(fail ? fail + ' 件しっぱい' : 'カメラの計算はすべて正しい ✅');
if (fail) process.exit(1);
