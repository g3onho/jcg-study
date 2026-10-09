import { makeSupabaseApi } from './supabase.js';

let api;
export async function getApi() {
  if (api) return api;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    const { makeMockApi } = await import('./mock.js');
    api = makeMockApi();
  } else {
    api = makeSupabaseApi();
  }
  return api;
}
