import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET } from '../config.js';

export function makeSupabaseApi() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // 탭 간 navigator.locks 대기로 앱이 멈추는 문제를 피하려고 탭 내부 잠금(processLock)을 사용한다.
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jcg-auth', lock: processLock },
  });
  const api = {
    kind: 'supabase',
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuthChange(cb) { const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s)); return () => data.subscription.unsubscribe(); },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error; return data.session;
    },
    async signOut() { await sb.auth.signOut(); },
    async loadContent() {
      const { data, error } = await sb.storage.from(BUCKET).download('content/bundle.json', { cacheNonce: Date.now() });
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
    async fetchKV() {
      const { data, error } = await sb.from('kv').select('key,value,version,updated_at,device');
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
    async isAllowed() {
      const { data, error } = await sb.rpc('is_allowed');
      if (error) throw error; return !!data;
    },
  };
  return api;
}
