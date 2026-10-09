import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET } from '../config.js';

const missingServer = e => (e && /PGRST202|Could not find the function|schema cache/i.test((e.code || '') + ' ' + (e.message || '')))
  ? new Error('서버에 관리자·피드백 기능이 아직 적용되지 않았습니다. supabase/admin_feedback.sql을 Supabase SQL Editor에서 실행하세요.') : e;

export function makeSupabaseApi() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jcg-auth' },
  });
  const api = {
    kind: 'supabase',
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuthChange(cb) { const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s)); return () => data.subscription.unsubscribe(); },
    async signIn(identifier, password) {
      if (!identifier.includes('@')) {
        const { data, error } = await sb.functions.invoke('account-access', { body: { action: 'login', username: identifier, password } });
        if (error) throw new Error('아이디 로그인에 실패했습니다. 입력 내용을 확인하거나 이메일 로그인을 이용하세요.');
        const result = await sb.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
        if (result.error) throw result.error;
        return result.data.session;
      }
      const { data, error } = await sb.auth.signInWithPassword({ email: identifier, password });
      if (error) throw error; return data.session;
    },
    async signOut() { await sb.auth.signOut(); },
    async loadContent(isAdmin) {
      const { data, error } = await sb.storage.from(BUCKET).download(isAdmin ? 'content/bundle.json' : 'content/student.json', { cacheNonce: Date.now() });
      if (error) throw error;
      return JSON.parse(await data.text());
    },
    async contentMeta() {
      const { data, error } = await sb.storage.from(BUCKET).download('content/meta.json', { cacheNonce: Date.now() });
      if (error) return null;
      return JSON.parse(await data.text());
    },
    async signedUrl(path, expires = 600) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expires);
      if (error) throw error; return data.signedUrl;
    },
    async signedUrls(paths, expires = 3600) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, expires);
      if (error) throw error; return data;
    },
    async fetchEvents() {
      const out = []; const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await sb.from('events').select('*').order('created_at', { ascending: true }).range(from, from + size - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < size) break;
      }
      return out;
    },
    async insertEvents(evs) {
      if (!evs.length) return;
      const rows = evs.map(e => ({ id: e.id, type: e.type, item_id: e.item_id, data: e.data, client_at: e.client_at, device: e.device, content_version: e.content_version }));
      const { error } = await sb.from('events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
    // 필기(ink:*)는 용량이 커서 시작할 때 전부 받지 않는다(문제를 열 때 fetchKVByKeys로 개별 로드).
    async fetchKV() {
      const cols = 'key,value,version,updated_at,device';
      let { data, error } = await sb.from('kv').select(cols).not('key', 'like', 'ink:%');
      if (error) { // 필터를 서버가 거부해도 앱이 멈추지 않게: 전체를 받아 클라이언트에서 거른다
        ({ data, error } = await sb.from('kv').select(cols));
        if (error) throw error;
        data = data.filter(r => !r.key.startsWith('ink:'));
      }
      return data;
    },
    async fetchKVByKeys(keys) {
      if (!keys.length) return [];
      const { data, error } = await sb.from('kv').select('key,value,version,updated_at,device').in('key', keys);
      if (error) throw error; return data;
    },
    async fetchKVPrefix(prefix) {
      const { data, error } = await sb.from('kv').select('key,value,version,updated_at,device').like('key', prefix + '%');
      if (error) throw error; return data;
    },
    async kvPut(key, value, expected, device) {
      const { data, error } = await sb.rpc('kv_put', { p_key: key, p_value: value, p_expected: expected || 0, p_device: device });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    async kvDelete(key) {
      const { error } = await sb.from('kv').delete().eq('key', key);
      if (error) throw error;
    },
    async uploadFile(path, blob, contentType) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true, cacheControl: '60' });
      if (error) throw error;
    },
    async whoami() { const { data } = await sb.auth.getUser(); return data.user; },
    async isAdmin() {
      const { data, error } = await sb.rpc('is_admin');
      if (error) throw new Error('계정 권한 설정을 확인하지 못했습니다. 관리자에게 문의하세요.');
      return data === true;
    },
    async registerUser({ username, password }) {
      const { data, error } = await sb.functions.invoke('account-access', { body: { action: 'register', username, password } });
      if (error) throw new Error('계정 등록에 실패했습니다. 아이디 중복과 서버 설정을 확인하세요.');
      return data;
    },
    async resetPassword({ username, password }) {
      const { data, error } = await sb.functions.invoke('account-access', { body: { action: 'reset_password', username, password } });
      if (error) throw new Error('비밀번호 재설정에 실패했습니다. 아이디(일반 사용자만 가능)를 확인하세요.');
      return data;
    },
    async adminOverview() { const { data, error } = await sb.rpc('admin_user_overview'); if (error) throw missingServer(error); return data; },
    async setUserDisabled(userId, disabled) { const { error } = await sb.rpc('admin_set_user_disabled', { p_user: userId, p_disabled: disabled }); if (error) throw missingServer(error); },
    async adminFeedback() { const { data, error } = await sb.rpc('admin_feedback_list'); if (error) throw missingServer(error); return data; },
    async setFeedbackStatus(id, status) { const { error } = await sb.rpc('admin_set_feedback_status', { p_id: id, p_status: status }); if (error) throw missingServer(error); },
    async submitFeedback(f) {
      const { error } = await sb.rpc('submit_feedback', { p_category: f.category, p_message: f.message, p_context: f.context || '', p_device: f.device || '', p_app_version: f.appVersion || '', p_content_version: f.contentVersion || '' });
      if (error) throw (/too many feedback/.test(error.message) ? new Error('오늘 보낼 수 있는 의견 수(20개)를 넘었습니다. 내일 다시 보내 주세요.') : missingServer(error));
    },
    async myFeedback() {
      const { data, error } = await sb.from('feedback').select('id,category,message,context,status,created_at').order('created_at', { ascending: false }).limit(50);
      if (error) throw missingServer(error); return data;
    },
    async isAllowed() {
      const { data, error } = await sb.rpc('is_allowed');
      if (error) throw error; return !!data;
    },
  };
  return api;
}
