import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAccount } from '../supabase/functions/account-access/handler.js';

const request = (body, token) => new Request('https://example.com/account-access', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const registration = { action: 'register', username: 'learner_1', email: 'learner@example.com', password: 'test-long-password' };
function backend(role = 'student') {
  const calls = [];
  const admin = {
    rpc: async () => ({ data: true }),
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }), admin: {
      getUserById: async () => ({ data: { user: { email: 'private@example.com' } } }),
      createUser: async input => { calls.push(input); return { data: { user: { id: 'new' } } }; },
      deleteUser: async id => { calls.push({ deleted: id }); return {}; },
    } },
    from(table) { return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === 'allowed_users' ? { role } : null }; },
      async insert(row) { calls.push({ table, row }); return {}; },
    }; },
  };
  return { admin, auth: { auth: { signInWithPassword: async () => ({ error: true }) } }, calls };
}
test('로그인하지 않은 요청은 계정을 생성하지 못한다', async () => {
  const db = backend('admin'); const result = await handleAccount(request(registration), db);
  assert.equal(result.status, 401); assert.deepEqual(db.calls, []);
});
test('일반 사용자가 관리자 등록 API를 직접 호출해도 차단한다', async () => {
  const db = backend(); const result = await handleAccount(request(registration, 'test-token'), db);
  assert.equal(result.status, 403); assert.deepEqual(db.calls, []);
});
test('요청에 admin을 넣어도 새 계정은 일반 사용자로만 생성한다', async () => {
  const db = backend('admin'); const result = await handleAccount(request({ ...registration, role: 'admin' }, 'test-token'), db);
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls.find(c => c.table === 'allowed_users').row, { user_id: 'new', role: 'student' });
});
test('존재하지 않는 아이디의 응답에는 이메일이 없다', async () => {
  const db = backend(); const result = await handleAccount(request({ action: 'login', username: 'unknown', password: 'invalid' }), db);
  assert.equal(result.status, 401); assert.deepEqual(await result.json(), { error: 'Invalid login credentials' });
});

test('아이디를 정규화해 비밀번호 인증하고 세션만 반환한다', async () => {
  const db = backend(); const from = db.admin.from;
  db.admin.from = table => { const query = from(table); if (table === 'login_profiles') query.maybeSingle = async () => ({ data: { user_id: 'known-user' } }); return query; };
  db.admin.rpc = async (_name, args) => { assert.equal(args.p_username, 'learner_1'); return { data: true }; };
  db.auth.auth.signInWithPassword = async input => {
    assert.deepEqual(input, { email: 'private@example.com', password: 'test-password' });
    return { data: { session: { access_token: 'test-access', refresh_token: 'test-refresh', user: { email: input.email } } } };
  };
  const result = await handleAccount(request({ action: 'login', username: ' LEARNER_1 ', password: 'test-password' }), db);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { session: { access_token: 'test-access', refresh_token: 'test-refresh' } });
});

test('요청 크기는 문자 수가 아니라 실제 바이트 수로 제한한다', async () => {
  const db = backend(); db.admin.rpc = () => { throw new Error('must not reach database'); };
  const result = await handleAccount(request({ action: 'login', username: 'learner_1', password: '가'.repeat(1500) }), db);
  assert.equal(result.status, 413); assert.deepEqual(db.calls, []);
});
test('로그인 시도 제한에 도달하면 비밀번호 인증까지 진행하지 않는다', async () => {
  const db = backend(); db.admin.rpc = async () => ({ data: false });
  db.admin.from = () => { throw new Error('must not look up account'); };
  const result = await handleAccount(request({ action: 'login', username: 'unknown', password: 'invalid' }), db);
  assert.equal(result.status, 401);
});
test('등록 중 DB 저장이 실패하면 방금 만든 계정만 복구 처리한다', async () => {
  const db = backend('admin'); const from = db.admin.from;
  db.admin.from = table => { const query = from(table); if (table === 'login_profiles') query.insert = async () => ({ error: true }); return query; };
  const result = await handleAccount(request(registration, 'test-token'), db);
  assert.equal(result.status, 500); assert.ok(db.calls.some(c => c.deleted === 'new'));
});
