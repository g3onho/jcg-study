import { useEffect, useState } from 'preact/hooks';
import { useStore, getState } from '../store.js';
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS, refLabel } from './Feedback.jsx';

const when = iso => iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const ago = iso => {
  if (!iso) return '—'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? '오늘' : d + '일 전';
};
const TABS = [['users', '사용자 현황'], ['feedback', '받은 의견'], ['accounts', '계정 등록']];

export function Admin({ route }) {
  const s = useStore();
  const [tab, setTab] = useState(TABS.some(t => t[0] === route.q.tab) ? route.q.tab : 'users');
  const [newCount, setNewCount] = useState(null);
  useEffect(() => { s.api.adminFeedback().then(f => setNewCount(f.filter(x => x.status === 'new').length)).catch(() => setNewCount(null)); }, [tab]);
  return (
    <div class="page admin">
      <h1>관리자</h1>
      <div class="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'feedback' && newCount ? ` (새 의견 ${newCount})` : ''}</button>)}
      </div>
      {tab === 'users' && <Users />}
      {tab === 'feedback' && <FeedbackInbox onCount={setNewCount} />}
      {tab === 'accounts' && <AccountRegistration />}
    </div>
  );
}

function useLoad(fn) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = () => { setState(x => ({ ...x, loading: true })); fn().then(data => setState({ data, error: null, loading: false })).catch(e => setState({ data: null, error: e.message || String(e), loading: false })); };
  useEffect(reload, []);
  return [state, reload];
}

function Users() {
  const s = useStore();
  const [st, reload] = useLoad(() => s.api.adminOverview());
  const [resetFor, setResetFor] = useState(null); const [msg, setMsg] = useState('');
  if (st.loading && !st.data) return <p class="small muted">불러오는 중…</p>;
  if (st.error) return <div class="alert" role="alert">사용자 현황을 불러오지 못했습니다: {st.error}</div>;
  const users = st.data; const students = users.filter(u => u.role !== 'admin');
  const active7 = students.filter(u => u.last_activity && Date.now() - new Date(u.last_activity) < 7 * 86400000).length;
  async function toggle(u) {
    if (!confirm(u.disabled ? `${u.username} 계정의 접근을 다시 허용할까요?` : `${u.username} 계정의 접근을 차단할까요? 학습 기록은 지워지지 않고, 로그인·자료 접근만 막힙니다.`)) return;
    try { await s.api.setUserDisabled(u.user_id, !u.disabled); setMsg(`${u.username}: ${u.disabled ? '접근을 허용했습니다.' : '접근을 차단했습니다.'}`); reload(); } catch (e) { setMsg('실패: ' + (e.message || e)); }
  }
  return (
    <>
      <p class="small">일반 사용자 {students.length}명 · 최근 7일 안에 학습한 사용자 {active7}명 <button class="linkbtn" onClick={reload}>새로고침</button></p>
      <p class="small muted">학습 기록의 요약 숫자만 보여 줍니다. 사용자의 답안 내용·필기·이메일은 이 화면에서 볼 수 없습니다.</p>
      {msg && <div class="notice small" role="status">{msg}</div>}
      <div class="tbl" tabIndex={0}><table>
        <thead><tr><th>아이디</th><th>상태</th><th>마지막 로그인</th><th>마지막 학습</th><th>풀이 (정답/시도)</th><th>푼 문제</th><th>읽은 개념</th><th>모의시험</th><th>관리</th></tr></thead>
        <tbody>{users.map(u => (
          <tr key={u.user_id} class={u.disabled ? 'dim' : ''}>
            <td><b>{u.username}</b>{u.role === 'admin' ? ' (관리자)' : ''}</td>
            <td>{u.disabled ? '차단됨' : '사용 중'}</td>
            <td title={when(u.last_sign_in_at)}>{ago(u.last_sign_in_at)}</td>
            <td title={when(u.last_activity)}>{ago(u.last_activity)}</td>
            <td>{u.correct}/{u.attempts}{u.attempts ? ` (${Math.round(u.correct / u.attempts * 100)}%)` : ''}</td>
            <td>{u.problems_tried}</td><td>{u.concepts_read}</td><td>{u.exam_runs}회</td>
            <td>{u.role === 'admin' ? '—' : <div class="row wrap tight">
              <button class="btn small" onClick={() => toggle(u)}>{u.disabled ? '접근 허용' : '접근 차단'}</button>
              <button class="btn small" onClick={() => setResetFor(resetFor === u.username ? null : u.username)}>비밀번호 재설정</button></div>}</td>
          </tr>))}</tbody></table></div>
      {resetFor && <ResetPassword key={resetFor} username={resetFor} onDone={m => { setMsg(m); setResetFor(null); }} />}
    </>
  );
}

function ResetPassword({ username, onDone }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); const pw = e.currentTarget.password.value; setBusy(true); setErr('');
    try { await getState().api.resetPassword({ username, password: pw }); onDone(`${username}: 비밀번호를 바꿨습니다. 새 비밀번호를 사용자에게 전달하세요.`); }
    catch (x) { setErr(x.message || String(x)); setBusy(false); }
  }
  return <form class="card account-form" onSubmit={submit}>
    <b>{username} 비밀번호 재설정</b>
    <label>새 비밀번호 (12자 이상)<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
    {err && <div class="alert" role="alert">{err}</div>}
    <button class="btn primary" disabled={busy}>{busy ? '변경 중…' : '비밀번호 바꾸기'}</button>
  </form>;
}

function FeedbackInbox({ onCount }) {
  const s = useStore();
  const [st, reload] = useLoad(() => s.api.adminFeedback());
  const [filter, setFilter] = useState('new'); const [err, setErr] = useState('');
  useEffect(() => { if (st.data) onCount(st.data.filter(x => x.status === 'new').length); }, [st.data]);
  if (st.loading && !st.data) return <p class="small muted">불러오는 중…</p>;
  if (st.error) return <div class="alert" role="alert">의견을 불러오지 못했습니다: {st.error}</div>;
  const all = st.data; const list = all.filter(f => !filter || f.status === filter);
  async function mark(f, status) { setErr(''); try { await s.api.setFeedbackStatus(f.id, status); reload(); } catch (e) { setErr('상태를 바꾸지 못했습니다: ' + (e.message || e)); } }
  return (
    <>
      <div class="chips">{[['new', '새 의견'], ['read', '확인함'], ['done', '처리 완료'], ['', '전체']].map(([k, l]) =>
        <button key={k} class={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {k ? all.filter(f => f.status === k).length : all.length}</button>)}</div>
      {err && <div class="alert" role="alert">{err}</div>}
      {!list.length ? <div class="empty">해당하는 의견이 없습니다.</div> :
        <ul class="feedback-inbox">{list.map(f => (
          <li key={f.id} class={'card fb-' + f.status}>
            <div class="small"><b>{f.username}</b> · {FEEDBACK_CATEGORY[f.category]} · <span class="muted">{when(f.created_at)}</span> · <b class={'fb-' + f.status}>{FEEDBACK_STATUS[f.status]}</b></div>
            {f.context && <div class="small">대상: <a href={'#' + f.context}>{refLabel(s.content, f.context) || f.context}</a></div>}
            <div class="fb-msg">{f.message}</div>
            <div class="small muted">{[f.device, f.app_version && '앱 ' + f.app_version, f.content_version && '콘텐츠 ' + f.content_version].filter(Boolean).join(' · ')}</div>
            <div class="row wrap">{f.status !== 'read' && <button class="btn small" onClick={() => mark(f, 'read')}>확인함</button>}
              {f.status !== 'done' && <button class="btn small ok" onClick={() => mark(f, 'done')}>처리 완료</button>}
              {f.status !== 'new' && <button class="btn small ghost" onClick={() => mark(f, 'new')}>새 의견으로</button>}</div>
          </li>))}</ul>}
    </>
  );
}

export function AccountRegistration() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(null);
  async function submit(e) {
    e.preventDefault(); const form = e.currentTarget; setBusy(true); setMessage(null);
    const username = form.username.value.trim().toLowerCase();
    try {
      await getState().api.registerUser({ username, password: form.password.value });
      form.reset(); setMessage({ ok: true, text: `'${username}' 계정을 등록했습니다. 아이디와 초기 비밀번호를 사용자에게 전달하세요.` });
    } catch (err) { setMessage({ ok: false, text: err.message }); }
    finally { setBusy(false); }
  }
  return <section><h2 class="h3">사용자 계정 등록</h2><p class="small muted">아이디와 초기 비밀번호만 정하면 됩니다(이메일 불필요). 새 계정은 일반 사용자이며 원본·출처·자료 관리·관리자 화면에 접근할 수 없습니다.</p>
    <form class="account-form" onSubmit={submit}>
      <label>로그인 아이디<input name="username" type="text" pattern="[a-z0-9_]{3,30}" minLength={3} maxLength={30} autoCapitalize="none" autoComplete="off" spellcheck={false} title="영문 소문자·숫자·밑줄 3~30자" required /></label>
      <label>초기 비밀번호 (12자 이상)<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
      <button class="btn primary" disabled={busy}>{busy ? '등록 중…' : '사용자 등록'}</button>
    </form>
    {message && <div class={message.ok ? 'notice small' : 'alert'} role="status">{message.text}</div>}
  </section>;
}
