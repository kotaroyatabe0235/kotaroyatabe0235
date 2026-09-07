// ブラウザなしでゲームのロジックを走らせる検証用スタブ
let CLOCK = 0;
let drawCalls = 0;
const els = new Map();
function makeEl(id) {
  const kids = Array.from({ length: 4 }, () => ({ classList: { toggle() {} } }));
  return {
    id, style: {}, textContent: '', innerHTML: '', onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    get childElementCount() { return 4; },
    children: kids,
    width: 800, height: 600,
    getContext() { return glStub; },
  };
}
const glStub = new Proxy({}, {
  get(t, k) {
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getAttribLocation') return () => 0;
    if (k === 'getUniformLocation') return () => ({});
    if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer') return () => ({});
    if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
    if (k === 'drawArrays') return () => { drawCalls++; };
    if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) return 0x100;
    return () => {};
  }
});
globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); }
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.performance = { now: () => CLOCK };
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.setTimeout = (fn) => 0;
globalThis.clearTimeout = () => {};
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.__driver = () => ({ get frame() { return rafCb; }, tick: (ms) => { CLOCK += ms; }, drawCalls: () => drawCalls });
