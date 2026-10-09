// 필기(손글씨) 데이터의 순수 로직. 화면·네트워크와 무관하게 테스트할 수 있도록 분리했다.
// 저장: 문제 하나당 kv 한 행 'ink:<문제ID>' (DB 스키마 변경 없음). 학습 이벤트(채점 기록)와는 별개다.
//
// 값 구조  { v:1, s:[획...], d:[지운 획 id...], h:연습지 높이 }
//   획  { i:id, l:'c'|'p', k:색 번호, p:[x0,y0,dx,dy,...] }   (좌표는 정수 단위, 두 번째 점부터는 이전 점과의 차이)
//   l = 'c' 코드 위 필기(단위: 글자 높이 1em = 20단위), 'p' 연습지(가로 전체 = 1000단위)
// 다른 기기와 동시에 수정되면 획 id 합집합으로 합친다(지운 획은 d에 남겨 되살아나지 않게 함). 어느 쪽 필기도 조용히 사라지지 않는다.

export const INK_PREFIX = 'ink:';
export const inkKey = id => INK_PREFIX + id;
export const isInkKey = key => typeof key === 'string' && key.startsWith(INK_PREFIX);

export const PAD_W = 1000;
export const PAD_H0 = 600, PAD_STEP = 500, PAD_MAX = 4000;
export const CODE_UNIT = 20;
export const MAX_BYTES = 400000;     // 문제 하나의 필기 한도(JSON 글자 수 기준)
const MAX_TOMBSTONES = 3000;

export const COLORS = [
  { name: '검정', light: '#1d232b', dark: '#e8eaed' },
  { name: '파랑', light: '#1f5fcf', dark: '#8ab8ff' },
  { name: '빨강', light: '#c62828', dark: '#ff8a80' },
];

export const emptyInk = () => ({ v: 1, s: [], d: [], h: PAD_H0 });

// 시간순으로 정렬되는 12글자 id: 시각(8) + 같은 ms 안의 순번(2) + 난수(2).
// 이 기기에서 만든 id는 항상 증가한다(시계가 뒤로 가거나 한 ms에 여러 획이 생겨도 순서·유일성 유지).
let lastT = 0, seq = 0;
export function newId() {
  let t = Date.now();
  if (t <= lastT) { t = lastT; seq++; if (seq > 1295) { t = lastT + 1; seq = 0; } } else seq = 0;
  lastT = t;
  return t.toString(36).padStart(8, '0') + seq.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 4).padEnd(2, '0');
}

export function packPoints(pts) {
  const out = []; let px = 0, py = 0;
  for (let n = 0; n + 1 < pts.length; n += 2) {
    const x = Math.round(pts[n]), y = Math.round(pts[n + 1]);
    out.push(x - px, y - py); px = x; py = y;
  }
  return out;
}
export function unpackPoints(d) {
  const out = []; let x = 0, y = 0;
  for (let n = 0; n + 1 < d.length; n += 2) { x += d[n]; y += d[n + 1]; out.push(x, y); }
  return out;
}

const validStroke = s => s && typeof s.i === 'string' && (s.l === 'c' || s.l === 'p') && Array.isArray(s.p) && s.p.length >= 2 && s.p.every(Number.isFinite);

// 서버·로컬에서 읽은 값을 안전한 구조로 바꾼다(손상된 값이 와도 앱이 멈추지 않게).
export function decodeInk(raw) {
  if (!raw || raw.v !== 1) return emptyInk();
  const d = Array.isArray(raw.d) ? raw.d.filter(x => typeof x === 'string') : [];
  const dead = new Set(d);
  const s = (Array.isArray(raw.s) ? raw.s : []).filter(x => validStroke(x) && !dead.has(x.i));
  const h = Number.isFinite(raw.h) ? Math.min(PAD_MAX, Math.max(PAD_H0, Math.round(raw.h))) : PAD_H0;
  return { v: 1, s, d, h };
}

export function strokesOf(ink, layer) { return ink.s.filter(x => x.l === layer); }

function finalize(ink) {
  const dead = new Set(ink.d);
  const s = ink.s.filter(x => !dead.has(x.i));
  const d = ink.d.length > MAX_TOMBSTONES ? [...ink.d].sort().slice(-MAX_TOMBSTONES) : ink.d;
  return { v: 1, s, d, h: ink.h };
}

export const addStroke = (ink, stroke) => finalize({ ...ink, s: [...ink.s, stroke] });
export const eraseIds = (ink, ids) => finalize({ ...ink, d: [...new Set([...ink.d, ...ids])] });
export const extendPad = ink => ({ ...ink, h: Math.min(PAD_MAX, ink.h + PAD_STEP) });
export const sizeOf = ink => JSON.stringify(ink).length;

// 두 기기의 값을 합친다. 서버 값과 이 기기 값 모두 보존(지운 획만 제외).
export function mergeInk(mine, server) {
  const a = decodeInk(mine), b = decodeInk(server);
  const dead = new Set([...a.d, ...b.d]);
  const map = new Map();
  for (const st of [...b.s, ...a.s]) if (!dead.has(st.i) && !map.has(st.i)) map.set(st.i, st);
  const s = [...map.values()].sort((x, y) => (x.i < y.i ? -1 : x.i > y.i ? 1 : 0));
  return finalize({ v: 1, s, d: [...dead], h: Math.max(a.h, b.h) });
}
// store.js가 쓰는 연결점: 병합 규칙이 있는 키면 합친 값을, 없으면 undefined를 돌려준다.
export function mergeKV(key, mine, server) { return isInkKey(key) ? mergeInk(mine, server) : undefined; }

// 점 줄이기(Ramer–Douglas–Peucker). pts는 [x,y,x,y,...]
export function simplify(pts, eps) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let idx = -1, max = eps;
    for (let i = a + 1; i < b; i++) {
      const dd = distSeg(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]);
      if (dd > max) { max = dd; idx = i; }
    }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 지우개: (x,y) 반경 r 안을 지나는 획인지
export function hitStroke(stroke, x, y, r) {
  const p = unpackPoints(stroke.p);
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= r;
  for (let i = 0; i + 3 < p.length; i += 2) if (distSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
  return false;
}
