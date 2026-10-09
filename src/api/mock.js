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
    async registerUser({ username }) {
      if (!await api.isAdmin()) throw new Error('Forbidden');
      const us = read('users', []); if (us.some(u => u.username === username)) throw new Error('계정 등록에 실패했습니다. 아이디 중복과 서버 설정을 확인하세요.');
      us.push({ user_id: 'mock-' + username, username, role: 'student', disabled: false, created_at: new Date().toISOString(), last_sign_in_at: null, attempts: 0, correct: 0, problems_tried: 0, concepts_read: 0, exam_runs: 0, last_activity: null });
      write('users', us); return { ok: true };
    },
    async resetPassword({ username }) { if (!await api.isAdmin()) throw new Error('Forbidden'); if (!read('users', []).some(u => u.username === username)) throw new Error('비밀번호 재설정에 실패했습니다. 아이디(일반 사용자만 가능)를 확인하세요.'); return { ok: true }; },
    async adminOverview() {
      await net(); if (!await api.isAdmin()) throw new Error('not allowed');
      return [{ user_id: 'mock-admin', username: 'test_admin', role: 'admin', disabled: false, created_at: '2026-09-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), attempts: 12, correct: 9, problems_tried: 10, concepts_read: 4, exam_runs: 1, last_activity: new Date().toISOString() }, ...read('users', [])];
    },
    async setUserDisabled(id, disabled) { await net(); write('users', read('users', []).map(u => u.user_id === id ? { ...u, disabled } : u)); },
    async adminFeedback() { await net(); if (!await api.isAdmin()) throw new Error('not allowed'); return read('feedback', []).slice().reverse().map(f => ({ ...f, username: f.user_id === 'mock-admin' ? 'test_admin' : 'test_user' })); },
    async setFeedbackStatus(id, status) { await net(); write('feedback', read('feedback', []).map(f => f.id === id ? { ...f, status } : f)); },
    async submitFeedback(f) {
      await net(); const me = read('session', null)?.user?.id; const all = read('feedback', []);
      all.push({ id: 'fb' + Date.now(), user_id: me, category: f.category, message: f.message, context: f.context || null, device: f.device, app_version: f.appVersion, content_version: f.contentVersion, status: 'new', created_at: new Date().toISOString() });
      write('feedback', all);
    },
    async myFeedback() { await net(); const me = read('session', null)?.user?.id; return read('feedback', []).filter(f => f.user_id === me).reverse(); },
  };
  return api;
}
