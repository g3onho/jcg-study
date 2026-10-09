// 개발·자동 테스트 전용 백엔드. 프로덕션 빌드에서는 사용되지 않는다(import.meta.env.DEV 가드).
// 실패 주입: localStorage 'mock:offline' = '1' 이면 네트워크 오류를 흉내 낸다.
const LS = k => 'mock:' + k;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(LS(k))) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(LS(k), JSON.stringify(v));
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
      if (email !== 'test@example.com' || password !== 'test-password') throw new Error('Invalid login credentials');
      const s = { user: { id: 'mock-user', email } }; write('session', s); listeners.forEach(f => f(s)); return s;
    },
    async signOut() { localStorage.removeItem(LS('session')); listeners.forEach(f => f(null)); },
    async loadContent() {
      await net();
      if (!read('session', null)) throw new Error('not authenticated');
      const r = await fetch('/@fs/home/claude/work/build/bundle.json'); return r.json();
    },
    async contentMeta() { return null; },
    async signedUrl(path) { await net(); return '/@fs/home/claude/work/build/storage/' + path; },
    async signedUrls(paths) { return paths.map(p => ({ path: p, signedUrl: '/@fs/home/claude/work/build/storage/' + p })); },
    async fetchEvents() { await net(); return read('events', []); },
    async insertEvents(evs) {
      await net();
      const all = read('events', []); const ids = new Set(all.map(e => e.id));
      for (const e of evs) if (!ids.has(e.id)) { all.push({ ...e, created_at: new Date().toISOString() }); ids.add(e.id); }
      write('events', all);
    },
    async fetchKV() { await net(); return Object.values(read('kv', {})); },
    async kvPut(key, value, expected, device) {
      await net();
      const kv = read('kv', {}); const cur = kv[key];
      if ((cur ? cur.version : 0) !== (expected || 0)) return { ok: false, ...(cur || { version: 0, value: null }) };
      const row = { key, value, version: (cur ? cur.version : 0) + 1, updated_at: new Date().toISOString(), device };
      kv[key] = row; write('kv', kv); return { ok: true, ...row };
    },
    async kvDelete(key) { await net(); const kv = read('kv', {}); delete kv[key]; write('kv', kv); },
    async uploadFile() { await net(); },
    async whoami() { return read('session', null)?.user; },
    async isAllowed() { return true; },
  };
  return api;
}
