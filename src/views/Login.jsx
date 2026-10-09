import { useState } from 'preact/hooks';
import { signIn } from '../store.js';

export function Login() {
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    const f = e.currentTarget;
    try { await signIn(f.email.value.trim(), f.pw.value); }
    catch (x) { setErr(/Invalid login/i.test(x.message) ? '이메일 또는 비밀번호가 올바르지 않습니다.' : '로그인 실패: ' + x.message); }
    setBusy(false);
  }
  return (
    <div class="login">
      <form class="card" onSubmit={submit}>
        <h1>정보처리기사 실기 개인 학습</h1>
        <p class="muted">개인 전용 서비스입니다. 회원가입은 없으며, 등록된 계정만 로그인할 수 있습니다.</p>
        <label>이메일<input name="email" type="email" autoComplete="username" required /></label>
        <label>비밀번호<input name="pw" type="password" autoComplete="current-password" required /></label>
        {err && <div class="alert" role="alert">{err}</div>}
        <button class="btn primary" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
    </div>
  );
}
