import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { handleAccount } from './handler.js';

Deno.serve(request => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return handleAccount(request, {
    admin: createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options),
    auth: createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options),
  });
});
