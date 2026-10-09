const origins = new Set(['https://g3onho.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173']);
const usernamePattern = /^[a-z0-9_]{3,30}$/;
export const INTERNAL_EMAIL_DOMAIN = 'users.jcg-study.invalid';
export const internalEmail = username => `${username}@${INTERNAL_EMAIL_DOMAIN}`;

export async function handleAccount(request, { admin, auth }) {
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://g3onho.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: 'Forbidden' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Invalid input' }, 400);
    const decoder = new TextDecoder(); let text = '', bytes = 0;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return reply({ error: 'Request too large' }, 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!usernamePattern.test(username) || typeof body.password !== 'string' || !body.password || body.password.length > 72) return reply({ error: 'Invalid input' }, 400);

    if (body.action === 'login') {
      const fail = () => reply({ error: 'Invalid login credentials' }, 401);
      const slot = await admin.rpc('take_login_slot', { p_username: username });
      if (slot.error || slot.data !== true) return fail();
      const profile = await admin.from('login_profiles').select('user_id').eq('username', username).maybeSingle();
      if (profile.error || !profile.data) return fail();
      const user = await admin.auth.admin.getUserById(profile.data.user_id);
      if (user.error || !user.data.user?.email) return fail();
      const signed = await auth.auth.signInWithPassword({ email: user.data.user.email, password: body.password });
      if (signed.error || !signed.data.session) return fail();
      return reply({ session: { access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token } });
    }

    if (body.action !== 'register' && body.action !== 'reset_password') return reply({ error: 'Invalid action' }, 400);
    // 관리자 작업: 호출자가 관리자(allowed_users.role = admin, 차단 아님)인지 서버에서 다시 확인한다.
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Not authorized' }, 401);
    const identity = await admin.auth.getUser(token);
    if (identity.error || !identity.data.user) return reply({ error: 'Not authorized' }, 401);
    const role = await admin.from('allowed_users').select('role, disabled').eq('user_id', identity.data.user.id).maybeSingle();
    if (role.error || role.data?.role !== 'admin' || role.data?.disabled === true) return reply({ error: 'Forbidden' }, 403);
    if (body.password.length < 12) return reply({ error: 'Invalid input' }, 400);

    if (body.action === 'reset_password') {
      const target = await admin.from('login_profiles').select('user_id').eq('username', username).maybeSingle();
      if (target.error || !target.data) return reply({ error: 'Account not found' }, 404);
      const targetRole = await admin.from('allowed_users').select('role').eq('user_id', target.data.user_id).maybeSingle();
      if (targetRole.error || targetRole.data?.role === 'admin') return reply({ error: 'Forbidden' }, 403); // 관리자 비밀번호는 여기서 바꾸지 않는다
      const updated = await admin.auth.admin.updateUserById(target.data.user_id, { password: body.password });
      return updated.error ? reply({ error: 'Password reset failed' }, 500) : reply({ ok: true });
    }

    // 등록: 이메일은 받지 않는다. 인증 시스템이 요구하는 내부용 주소를 아이디로 만들며, 메일은 발송되지 않는다.
    const email = internalEmail(username);
    const exists = await admin.from('login_profiles').select('user_id').eq('username', username).maybeSingle();
    if (exists.error || exists.data) return reply({ error: 'Account registration failed' }, 409);
    const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
    if (created.error || !created.data.user) return reply({ error: 'Account registration failed' }, 409);
    const uid = created.data.user.id;
    const profile = await admin.from('login_profiles').insert({ user_id: uid, username });
    const allowed = profile.error ? profile : await admin.from('allowed_users').insert({ user_id: uid, role: 'student' });
    if (allowed.error) {
      // 방금 생성한 미완성 계정만 되돌린다. 기존 사용자와 학습 기록은 건드리지 않는다.
      const rollback = await admin.auth.admin.deleteUser(uid);
      return reply({ error: rollback.error ? 'Registration incomplete; administrator cleanup required' : 'Account registration failed' }, 500);
    }
    return reply({ ok: true });
  } catch { return reply({ error: 'Request failed' }, 400); }
}
