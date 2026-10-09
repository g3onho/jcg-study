import { useEffect, useState } from 'preact/hooks';
import { getApi } from './api/index.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 시 메모리만 */ } };

function deviceLabel() {
  let d = lsGet('jcg:device', null);
  if (!d) {
    const ua = navigator.userAgent;
    const kind = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? '태블릿' : /Mobi|iPhone|Android/i.test(ua) ? '휴대폰' : 'PC';
    d = kind + '-' + Math.random().toString(36).slice(2, 6); lsSet('jcg:device', d);
  }
  return d;
}

const state = {
  api: null, booting: true, session: null, allowed: null,
  content: null, contentError: null, contentLoading: false,
  events: [], kv: {}, outbox: [], kvPending: {}, conflicts: {},
  save: { status: 'idle', error: null, at: null }, loadedAt: null,
  device: deviceLabel(), online: navigator.onLine,
};
const subs = new Set();
let ver = 0;
function emit() { ver++; subs.forEach(f => f(ver)); }
export function useStore() {
  const [, set] = useState(0);
  const seen = ver;
  useEffect(() => {
    const f = v => set(v); subs.add(f);
    // 렌더 이후 구독 전에 상태가 바뀐 경우(초기화가 빨리 끝난 경우) 놓친 변경을 반영
    if (ver !== seen) set(ver);
    return () => subs.delete(f);
  }, []);
  return state;
}
export const getState = () => state;

const uidKey = k => `jcg:${k}:${state.session?.user?.id || 'anon'}`;
function persistLocal() { lsSet(uidKey('outbox'), state.outbox); lsSet(uidKey('kvPending'), state.kvPending); lsSet(uidKey('conflicts'), state.conflicts); }

export async function init() {
  state.api = await getApi();
  try {
    state.session = await Promise.race([state.api.getSession(), new Promise((_, rej) => setTimeout(() => rej(new Error('세션 확인 시간 초과')), 12000))]);
  } catch (e) { state.session = null; state.bootError = e.message; }
  state.api.onAuthChange(s => {
    const was = state.session?.user?.id; state.session = s;
    // supabase-js: 인증 상태 콜백 안에서 다른 Supabase 호출을 바로 기다리면 내부 잠금 때문에 멈출 수 있어 다음 틱으로 미룬다.
    if (s && s.user.id !== was) { setTimeout(() => loadAll(), 0); }
    if (!s) { state.content = null; state.events = []; state.kv = {}; }
    emit();
  });
  state.booting = false; emit();
  if (state.session) await loadAll();
  window.addEventListener('online', () => { state.online = true; emit(); flush(); });
  window.addEventListener('offline', () => { state.online = false; emit(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.session) { refresh(); } });
  setInterval(() => { if (state.session && (state.outbox.length || Object.keys(state.kvPending).length)) flush(); }, 15000);
}

export async function signIn(email, pw) { await state.api.signIn(email, pw); }
export async function signOut() {
  if (state.outbox.length || Object.keys(state.kvPending).length) {
    if (!confirm('아직 서버에 저장되지 않은 기록이 있습니다. 이 기기에 보관해 두었다가 다시 로그인하면 저장을 재시도합니다. 로그아웃할까요?')) return;
  }
  await state.api.signOut();
}

export async function loadAll() {
  state.outbox = lsGet(uidKey('outbox'), []);
  state.kvPending = lsGet(uidKey('kvPending'), {});
  state.conflicts = lsGet(uidKey('conflicts'), {});
  state.contentLoading = true; state.contentError = null; emit();
  const slow = setTimeout(() => { if (state.contentLoading) { state.contentError = '불러오는 데 시간이 오래 걸리고 있습니다. 네트워크 상태를 확인하거나 새로고침하세요.'; emit(); } }, 20000);
  try {
    state.allowed = await state.api.isAllowed();
    if (!state.allowed) { state.contentError = '이 계정은 콘텐츠 접근 권한이 없습니다.'; }
    else {
      const [content] = await Promise.all([state.api.loadContent(), refresh(true)]);
      state.content = indexContent(content);
    }
  } catch (e) {
    state.contentError = '콘텐츠를 불러오지 못했습니다: ' + (e.message || e);
  }
  clearTimeout(slow);
  state.contentLoading = false; emit();
  flush();
}

function indexContent(c) {
  c.problemById = Object.fromEntries(c.problems.map(p => [p.id, p]));
  c.conceptById = Object.fromEntries(c.concepts.map(x => [x.id, x]));
  c.fileById = Object.fromEntries(c.files.map(f => [f.id, f]));
  c.setById = Object.fromEntries((c.sets || []).map(s => [s.id, s]));
  c.problemsByConcept = {};
  for (const p of c.problems) for (const cid of p.concepts || []) (c.problemsByConcept[cid] ||= []).push(p.id);
  return c;
}

export async function refresh(silent) {
  try {
    const [evs, kvRows] = await Promise.all([state.api.fetchEvents(), state.api.fetchKV()]);
    const byId = new Map(evs.map(e => [e.id, e]));
    for (const e of state.outbox) if (!byId.has(e.id)) byId.set(e.id, e);
    state.events = [...byId.values()].sort((a, b) => (a.client_at || a.created_at || '').localeCompare(b.client_at || b.created_at || ''));
    const kv = {};
    for (const r of kvRows) kv[r.key] = r;
    for (const [k, p] of Object.entries(state.kvPending)) kv[k] = { ...(kv[k] || {}), value: p.value, pending: true, serverVersion: kv[k]?.version };
    state.kv = kv; state.loadedAt = new Date().toISOString();
    if (state.save.status === 'error' && !state.outbox.length && !Object.keys(state.kvPending).length) state.save = { status: 'saved', at: new Date().toISOString() };
  } catch (e) {
    if (!silent) { state.save = { status: 'error', error: '동기화 실패: ' + (e.message || e), at: state.save.at }; }
    else throw e;
  }
  emit();
}

let flushing = false, retryT = null, retryN = 0;
export async function flush() {
  if (flushing || !state.session) return;
  if (!state.outbox.length && !Object.keys(state.kvPending).length) return;
  flushing = true; state.save = { ...state.save, status: 'saving' }; emit();
  let err = null;
  try {
    if (state.outbox.length) {
      const batch = state.outbox.slice(0, 200);
      await state.api.insertEvents(batch);
      const ids = new Set(batch.map(e => e.id));
      state.outbox = state.outbox.filter(e => !ids.has(e.id));
    }
    for (const [key, p] of Object.entries({ ...state.kvPending })) {
      const res = await state.api.kvPut(key, p.value, p.expected, state.device);
      if (res && res.ok) {
        state.kv[key] = { key, value: res.value, version: res.version, updated_at: res.updated_at, device: res.device };
        if (state.kvPending[key] === p) delete state.kvPending[key];
        else if (state.kvPending[key]) state.kvPending[key].expected = res.version;
      } else {
        // 다른 기기에서 먼저 수정됨: 조용히 덮어쓰지 않고 충돌로 보관
        state.conflicts[key] = { mine: p.value, server: res ? { value: res.value, version: res.version, updated_at: res.updated_at, device: res.device } : null };
        delete state.kvPending[key];
        if (res) state.kv[key] = { key, value: p.value, version: res.version, updated_at: res.updated_at, device: res.device, conflict: true };
      }
    }
  } catch (e) { err = e; }
  persistLocal();
  flushing = false;
  const pending = state.outbox.length + Object.keys(state.kvPending).length;
  if (err) {
    state.save = { status: 'error', error: (navigator.onLine ? '서버 연결 오류' : '오프라인') + ` — 저장 대기 ${pending}건 (이 기기에 보관 중)`, at: state.save.at };
    clearTimeout(retryT); retryN = Math.min(retryN + 1, 6); retryT = setTimeout(flush, Math.min(60000, 2000 * 2 ** retryN));
  } else {
    retryN = 0;
    state.save = pending ? { status: 'saving', at: state.save.at } : { status: 'saved', at: new Date().toISOString() };
    if (pending) setTimeout(flush, 50);
  }
  emit();
}

export function addEvent(type, item_id, data) {
  const ev = { id: uuid(), type, item_id, data, client_at: new Date().toISOString(), device: state.device, content_version: state.content?.version };
  state.events = [...state.events, ev];
  state.outbox = [...state.outbox, ev];
  persistLocal(); emit(); flush();
  return ev;
}

const kvTimers = {};
export function setKV(key, value, debounceMs = 0) {
  const cur = state.kv[key];
  const expected = state.kvPending[key]?.expected ?? (cur?.pending ? cur.serverVersion : cur?.version) ?? 0;
  state.kvPending[key] = { value, expected };
  state.kv[key] = { ...(cur || {}), key, value, pending: true };
  persistLocal(); emit();
  clearTimeout(kvTimers[key]);
  kvTimers[key] = setTimeout(flush, debounceMs);
}
export const getKV = key => state.kv[key]?.value;

export function resolveConflict(key, choice) {
  const c = state.conflicts[key]; if (!c) return;
  delete state.conflicts[key];
  if (choice === 'server') {
    state.kv[key] = { key, value: c.server?.value ?? null, version: c.server?.version || 0 };
  } else {
    state.kvPending[key] = { value: c.mine, expected: c.server?.version || 0 };
    state.kv[key] = { key, value: c.mine, pending: true, serverVersion: c.server?.version || 0 };
  }
  persistLocal(); emit(); flush();
}

// 백업/복원
export function exportBackup() {
  return { format: 'jcg-backup-v1', exported_at: new Date().toISOString(), user: state.session?.user?.email, content_version: state.content?.version,
    events: state.events, kv: Object.fromEntries(Object.entries(state.kv).map(([k, v]) => [k, { value: v.value, updated_at: v.updated_at }])) };
}
export async function importBackup(obj, { kvMode = 'missing' } = {}) {
  if (obj.format !== 'jcg-backup-v1') throw new Error('지원하지 않는 백업 형식입니다.');
  const have = new Set(state.events.map(e => e.id));
  const add = obj.events.filter(e => !have.has(e.id)).map(e => ({ id: e.id, type: e.type, item_id: e.item_id, data: e.data, client_at: e.client_at, device: e.device, content_version: e.content_version }));
  state.events = [...state.events, ...add].sort((a, b) => (a.client_at || '').localeCompare(b.client_at || ''));
  state.outbox = [...state.outbox, ...add];
  let kvn = 0;
  for (const [k, v] of Object.entries(obj.kv || {})) {
    if (kvMode === 'missing' && state.kv[k]) continue;
    setKV(k, v.value); kvn++;
  }
  persistLocal(); emit(); await flush();
  return { events: add.length, kv: kvn };
}
