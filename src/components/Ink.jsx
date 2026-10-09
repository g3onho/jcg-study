import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, getKV, setKV, loadKV } from '../store.js';
import * as K from '../ink.js';

// 필기: 코드 위에 덧쓰기(c) + 코드 아래 연습지(p). 한 문제의 필기는 서버 kv 한 행('ink:<문제ID>')에 저장되어 기기 간에 이어진다.
// 필기는 학습 기록(채점·복습)에 영향을 주지 않는다.

const PREF_KEY = 'jcg:inkprefs';
const PEN_WIDTH = 2.2, ERASER_PX = 12, PALM_MS = 30000;
let penAt = 0; // 펜을 마지막으로 쓴 시각: 펜을 쓰는 동안 손바닥(터치)은 무시

export function useInkPrefs() {
  const [p, setP] = useState(() => {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { /* 설정 저장소 사용 불가 */ }
    return { tool: saved.tool === 'eraser' ? 'eraser' : 'pen', color: [0, 1, 2].includes(saved.color) ? saved.color : 0, on: false };
  });
  const set = patch => setP(cur => {
    const n = { ...cur, ...patch };
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ tool: n.tool, color: n.color })); } catch { /* 무시 */ }
    return n;
  });
  return [p, set];
}

// 한 문제의 필기 상태·조작. 값의 원본은 항상 store(kv)이고, 여기서는 읽고 쓰기만 한다.
export function useInk(pid) {
  useStore();
  const key = K.inkKey(pid);
  const raw = getKV(key);
  const ink = useMemo(() => K.decodeInk(raw), [raw]);
  const size = useMemo(() => K.sizeOf(ink), [ink]);
  const [load, setLoad] = useState('loading'); // loading | ok | fail
  const stack = useRef([]);
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true; stack.current = []; setLoad('loading'); bump(n => n + 1);
    loadKV(key).then(ok => alive && setLoad(ok ? 'ok' : 'fail'));
    return () => { alive = false; };
  }, [key]);
  const cur = () => K.decodeInk(getKV(key));
  const write = next => setKV(key, next, 700);
  const push = e => { stack.current.push(e); if (stack.current.length > 60) stack.current.shift(); bump(n => n + 1); };
  const api = {
    ink, load, size, tooBig: size > K.MAX_BYTES, nearLimit: size > K.MAX_BYTES * 0.8, canUndo: stack.current.length > 0,
    add(stroke) {
      const c = cur(); if (K.sizeOf(c) > K.MAX_BYTES) return false;
      write(K.addStroke(c, stroke)); push({ t: 'add', id: stroke.i }); return true;
    },
    erase(ids) {
      if (!ids.length) return;
      const c = cur(); const set = new Set(ids);
      push({ t: 'erase', strokes: c.s.filter(x => set.has(x.i)) });
      write(K.eraseIds(c, ids));
    },
    clear(layer) { api.erase(K.strokesOf(cur(), layer).map(x => x.i)); },
    extend() { write(K.extendPad(cur())); },
    undo() {
      const e = stack.current.pop(); if (!e) return;
      const c = cur();
      if (e.t === 'add') write(K.eraseIds(c, [e.id]));
      else { let n = c; for (const st of e.strokes) n = K.addStroke(n, { ...st, i: K.newId() }); write(n); } // 지운 획은 새 id로 되살려 다른 기기의 '지움' 기록과 충돌하지 않게 함
      bump(n => n + 1);
    },
  };
  return api;
}

const colorOf = (k, dark) => (K.COLORS[k] || K.COLORS[0])[dark ? 'dark' : 'light'];
const isDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

function drawStroke(ctx, pts, k, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = PEN_WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pts.length < 4) { ctx.beginPath(); ctx.arc(pts[0] * k, pts[1] * k, PEN_WIDTH / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(pts[0] * k, pts[1] * k);
  for (let i = 2; i + 3 < pts.length; i += 2) { // 중간점을 지나는 곡선으로 부드럽게
    ctx.quadraticCurveTo(pts[i] * k, pts[i + 1] * k, (pts[i] + pts[i + 2]) / 2 * k, (pts[i + 1] + pts[i + 3]) / 2 * k);
  }
  const n = pts.length; ctx.lineTo(pts[n - 2] * k, pts[n - 1] * k); ctx.stroke();
}

// w,h: 캔버스 CSS 크기(px), k: 1단위당 px
function InkCanvas({ layer, strokes, w, h, k, active, prefs, onAdd, onErase }) {
  const ref = useRef(null);
  const live = useRef(null);
  const hidden = useRef(new Set());
  const dpr = useMemo(() => Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(16e6 / Math.max(1, w * h)))), [w, h]);

  function redraw() {
    const c = ref.current; if (!c || !w || !h) return;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const dark = isDark();
    for (const st of strokes) if (!hidden.current.has(st.i)) drawStroke(ctx, K.unpackPoints(st.p), k, colorOf(st.k, dark));
  }
  useEffect(() => { hidden.current = new Set(); redraw(); }, [strokes, w, h, k, dpr]);

  const pos = e => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function addPoint(e) {
    const L = live.current; const [x, y] = pos(e);
    if (prefs.tool === 'eraser') {
      let hit = false;
      for (const st of strokes) if (!hidden.current.has(st.i) && K.hitStroke(st, x / k, y / k, ERASER_PX / k)) { L.erased.add(st.i); hidden.current.add(st.i); hit = true; }
      if (hit) redraw();
      return;
    }
    const n = L.pts.length;
    if (n >= 2 && Math.hypot(x - L.pts[n - 2], y - L.pts[n - 1]) < 1.2) return;
    L.pts.push(x, y);
    const ctx = ref.current.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = ctx.fillStyle = colorOf(prefs.color, isDark()); ctx.lineWidth = PEN_WIDTH; ctx.lineCap = 'round';
    if (n === 0) { ctx.beginPath(); ctx.arc(x, y, PEN_WIDTH / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(L.pts[n - 2], L.pts[n - 1]); ctx.lineTo(x, y); ctx.stroke(); }
  }
  function down(e) {
    if (!active || live.current) return;
    if (e.pointerType === 'touch' && Date.now() - penAt < PALM_MS) return; // 펜을 쓰는 중의 손바닥 터치 무시
    if (e.pointerType === 'pen') penAt = Date.now();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { ref.current.setPointerCapture(e.pointerId); } catch { /* 일부 환경 */ }
    live.current = { id: e.pointerId, pts: [], erased: new Set() };
    addPoint(e);
  }
  function move(e) {
    const L = live.current; if (!L || e.pointerId !== L.id) return;
    if (e.pointerType === 'pen') penAt = Date.now();
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    for (const ev of (evs && evs.length ? evs : [e])) addPoint(ev);
  }
  function up(e) {
    const L = live.current; if (!L || e.pointerId !== L.id) return;
    live.current = null;
    if (prefs.tool === 'eraser') { if (L.erased.size) onErase([...L.erased]); return; }
    if (!L.pts.length) return;
    const simple = K.simplify(L.pts.map(v => v / k), 0.5 / k);
    const stroke = { i: K.newId(), l: layer, k: prefs.color, p: K.packPoints(simple) };
    if (!onAdd(stroke)) { alert('이 문제의 필기 분량 한도에 도달했습니다. 필기를 일부 지운 뒤 다시 써 주세요.'); redraw(); }
  }
  function cancel() { if (live.current) { live.current = null; hidden.current = new Set(); redraw(); } }

  return (
    <canvas ref={ref} class={'inkcv' + (active ? ' on' : '')} style={{ width: w + 'px', height: h + 'px' }} role="img"
      aria-label={layer === 'c' ? '코드 위 필기 영역' : '연습지 필기 영역'}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={e => { if (active) e.preventDefault(); }} />
  );
}

// 코드 블록(.code) 안에 들어가 코드와 함께 스크롤되는 덧쓰기 층. Code 컴포넌트의 overlay 자리에 넣는다.
export function InkCodeLayer({ api, prefs }) {
  const holder = useRef(null);
  const [m, setM] = useState({ w: 0, h: 0, k: 0 });
  useEffect(() => {
    const code = holder.current?.parentElement, pre = code?.querySelector('pre'); if (!code || !pre) return;
    const measure = () => {
      const fs = parseFloat(getComputedStyle(pre).fontSize) || 14.5;
      setM({ w: Math.ceil(pre.offsetWidth), h: Math.ceil(code.clientHeight), k: fs / K.CODE_UNIT });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(code); ro.observe(pre);
    return () => ro.disconnect();
  }, []);
  const strokes = useMemo(() => K.strokesOf(api.ink, 'c'), [api.ink]);
  return (
    <div class="inkc" ref={holder} style={{ width: m.w + 'px', height: m.h + 'px' }}>
      {m.w > 0 && <InkCanvas layer="c" strokes={strokes} w={m.w} h={m.h} k={m.k} active={prefs.on} prefs={prefs} onAdd={api.add} onErase={api.erase} />}
    </div>
  );
}

// 코드 아래 연습지(격자). 시험의 손글씨 풀이 공간 역할.
export function InkPad({ api, prefs, hasCode, title = '연습지' }) {
  const wrap = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = wrap.current; const f = () => setW(Math.round(el.clientWidth));
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, []);
  const k = w / K.PAD_W, h = Math.round(api.ink.h * k);
  const strokes = useMemo(() => K.strokesOf(api.ink, 'p'), [api.ink]);
  return (
    <section class="inkpadbox">
        <h2 class="h3">{title} <span class="small muted">(필기용 · 채점되지 않음)</span></h2>
      <div class="inkpad" ref={wrap} style={{ height: h + 'px', '--cell': (50 * k) + 'px' }}>
        {w > 0 && <InkCanvas layer="p" strokes={strokes} w={w} h={h} k={k} active={prefs.on} prefs={prefs} onAdd={api.add} onErase={api.erase} />}
      </div>
      <div class="row wrap">
        <button class="btn small" onClick={() => api.extend()} disabled={api.ink.h >= K.PAD_MAX}>연습지 늘리기</button>
        <button class="btn small ghost" onClick={() => { if (confirm('연습지에 쓴 필기를 모두 지울까요? (되돌리기 버튼으로 복구할 수 있습니다)')) api.clear('p'); }}>연습지 지우기</button>
        {hasCode && <button class="btn small ghost" onClick={() => { if (confirm('코드 위에 쓴 필기를 모두 지울까요? (되돌리기 버튼으로 복구할 수 있습니다)')) api.clear('c'); }}>코드 위 필기 지우기</button>}
      </div>
    </section>
  );
}

export function InkBar({ api, prefs, setPrefs, hasCode }) {
  useEffect(() => { // 헤더 높이만큼 아래에 붙도록(휴대폰에서는 검색창 때문에 헤더가 두 줄)
    const top = document.querySelector('.top'); if (!top) return;
    const f = () => document.documentElement.style.setProperty('--topH', top.offsetHeight + 'px');
    f(); const ro = new ResizeObserver(f); ro.observe(top); return () => ro.disconnect();
  }, []);
  return (
    <div class={'inkbar' + (prefs.on ? ' on' : '')} role="toolbar" aria-label="필기 도구">
      <button class={'btn small' + (prefs.on ? ' primary' : '')} aria-pressed={prefs.on} onClick={() => setPrefs({ on: !prefs.on })}>
        {prefs.on ? '✍️ 필기 끄기(스크롤)' : '✍️ 필기 켜기'}
      </button>
      {prefs.on && <>
        {K.COLORS.map((c, i) => (
          <button key={i} class={'chip swatch' + (prefs.tool === 'pen' && prefs.color === i ? ' on' : '')} aria-pressed={prefs.tool === 'pen' && prefs.color === i}
            aria-label={'펜 ' + c.name} onClick={() => setPrefs({ tool: 'pen', color: i })}><span class="sw" style={{ background: 'var(--sw' + i + ')' }} />{c.name}</button>
        ))}
        <button class={'chip' + (prefs.tool === 'eraser' ? ' on' : '')} aria-pressed={prefs.tool === 'eraser'} onClick={() => setPrefs({ tool: 'eraser' })}>지우개</button>
        <button class="chip" onClick={() => api.undo()} disabled={!api.canUndo}>되돌리기</button>
      </>}
      <span class="small muted inkmsg" role="status">
        {api.load === 'loading' ? '필기 불러오는 중…'
          : api.load === 'fail' ? '서버에서 필기를 불러오지 못했습니다. 지금 쓰는 필기는 이 기기에 보관되고 연결되면 기존 필기와 합쳐 저장됩니다.'
          : api.tooBig ? '필기 분량 한도에 도달했습니다. 일부를 지운 뒤 쓰세요.'
          : api.nearLimit ? '필기 분량이 한도에 가깝습니다.'
          : prefs.on ? `펜·손가락·마우스로 ${hasCode ? '코드 위나 ' : ''}필기장에 쓰세요. 화면을 넘기려면 필기를 끄세요.`
          : `필기를 켜면 ${hasCode ? '코드 위와 ' : ''}필기장에 손으로 쓸 수 있습니다.`}
      </span>
    </div>
  );
}
