// 개발·자동 테스트 전용 백엔드. 프로덕션 빌드에서는 사용되지 않는다(import.meta.env.DEV 가드).
// 실패 주입: localStorage 'mock:offline' = '1' 이면 네트워크 오류를 흉내 낸다.
import { fixtureContent } from '../../tests/fixtures/content.js';
import { studentContent } from '../content-access.js';
const LS = k => 'mock:' + k;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(LS(k))) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(LS(k), JSON.stringify(v));
const userKey = key => key + ':' + read('session', null)?.user?.id;
const offline = () => localStorage.getItem('mock:offline') === '1';
const net = async () => { await new Promise(r => setTimeout(r, 120)); if (offline()) throw new Error('Failed to fetch (mock offline)'); };

export function makeMockApi() {
  let listeners = [];
  const api = {
    kind: 'mock',
    async getSession() { return read('session', null); },
    onAuthChange(cb) { listeners.push(cb); return () => { listeners = listeners.filter(x => x !== cb); }; },
    async signIn(email, password) {
      await net();
      const isAdmin = email === 'test@example.com' || email === 'test_admin';
      const isStudent = email === 'user@example.com' || email === 'test_user';
      if ((!isAdmin && !isStudent) || password !== 'test-password') throw new Error('Invalid login credentials');
      const s = { user: { id: isAdmin ? 'mock-admin' : 'mock-user', email: isAdmin ? 'test@example.com' : 'user@example.com' } }; write('session', s); listeners.forEach(f => f(s)); return s;
    },
    async signOut() { localStorage.removeItem(LS('session')); listeners.forEach(f => f(null)); },
    async loadContent(isAdmin) {
      await net();
      if (!read('session', null)) throw new Error('not authenticated');
      return isAdmin ? structuredClone(fixtureContent) : studentContent(fixtureContent);
    },
    async contentMeta() { return null; },
    async signedUrl(path) { await net(); if (!await api.isAdmin()) throw new Error('Forbidden'); return '/test-assets/' + path; },
    async signedUrls(paths) { return Promise.all(paths.map(async path => ({ path, signedUrl: await api.signedUrl(path) }))); },
    async fetchEvents() { await net(); return read(userKey('events'), []); },
    async insertEvents(evs) {
      await net();
      const all = read(userKey('events'), []); const ids = new Set(all.map(e => e.id));
      for (const e of evs) if (!ids.has(e.id)) { all.push({ ...e, created_at: new Date().toISOString() }); ids.add(e.id); }
      write(userKey('events'), all);
    },
    async fetchKV() { await net(); return Object.values(read(userKey('kv'), {})).filter(r => !r.key.startsWith('ink:')); },
    async fetchKVByKeys(keys) { await net(); const kv = read(userKey('kv'), {}); return keys.map(k => kv[k]).filter(Boolean); },
    async fetchKVPrefix(prefix) { await net(); return Object.values(read(userKey('kv'), {})).filter(r => r.key.startsWith(prefix)); },
    async kvPut(key, value, expected, device) {
      await net();
      const kv = read(userKey('kv'), {}); const cur = kv[key];
      if ((cur ? cur.version : 0) !== (expected || 0)) return { ok: false, ...(cur || { version: 0, value: null }) };
      const row = { key, value, version: (cur ? cur.version : 0) + 1, updated_at: new Date().toISOString(), device };
      kv[key] = row; write(userKey('kv'), kv); return { ok: true, ...row };
    },
    async kvDelete(key) { await net(); const kv = read(userKey('kv'), {}); delete kv[key]; write(userKey('kv'), kv); },
    async uploadFile() { await net(); },
    async whoami() { return read('session', null)?.user; },
    async isAllowed() { return true; },
    async isAdmin() { return read('session', null)?.user?.id === 'mock-admin'; },
    async registerUser() { if (!await api.isAdmin()) throw new Error('Forbidden'); return { ok: true }; },
  };
  return api;
}
