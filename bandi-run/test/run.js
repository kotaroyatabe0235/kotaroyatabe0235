/*
  ブラウザを開かずにゲームのロジックを確かめるテスト。

      node test/run.js            すべて実行
      node test/run.js camera     ひとつだけ実行

  しくみ: index.html から <script> の中身を取り出し、
  前に stub.js（WebGL と DOM のにせもの）、後ろにテスト本体をつないで node で走らせる。
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('index.html から <script> が見つかりません'); process.exit(1); }
const game = m[1];
const stub = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8');

const TESTS = {
  basic:  '基本動作（例外が出ないか・ジャンプの高さ）',
  camera: 'カメラの行列が正しいか',
  play:   'ステージを最後までクリアできるか',
};
const only = process.argv[2];
const names = only ? [only] : Object.keys(TESTS);

let failed = 0;
for (const name of names) {
  if (!TESTS[name]) { console.error('しらないテスト: ' + name); process.exit(1); }
  const body = fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8');
  const tmp = path.join(os.tmpdir(), `bandi-run-${name}-${process.pid}.js`);
  fs.writeFileSync(tmp, stub + '\n' + game + '\n' + body);
  console.log('=== ' + name + ' : ' + TESTS[name] + ' ===');
  const r = spawnSync(process.execPath, [tmp], { stdio: 'inherit' });
  fs.unlinkSync(tmp);
  if (r.status !== 0) { failed++; console.log('--> しっぱい\n'); } else { console.log(); }
}
console.log(failed ? failed + ' 件しっぱいしました' : 'ぜんぶ通りました ✅');
process.exit(failed ? 1 : 0);
