import { useEffect, useState } from 'preact/hooks';
import { useStore, getState } from '../store.js';
import { APP_VERSION } from '../config.js';

export const FEEDBACK_CATEGORY = { error: '오류 제보 (정답·해설·화면)', content: '문제·설명에 대한 의견', feature: '기능 요청', other: '기타' };
export const FEEDBACK_STATUS = { new: '접수됨', read: '확인함', done: '처리 완료' };
const when = iso => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

// '/p/문제ID' 또는 '/c/개념ID' 형태의 참조를 사람이 읽는 이름으로 바꾼다.
export function refLabel(content, ref) {
  const m = /^\/([pc])\/(.+)$/.exec(ref || ''); if (!m) return null;
  const id = decodeURIComponent(m[2]);
  if (m[1] === 'p') { const p = content?.problemById?.[id]; return p ? `${p.setTitle} ${p.no}번` : null; }
  const c = content?.conceptById?.[id]; return c ? `개념: ${c.title}` : null;
}
export const feedbackLink = ref => '#/feedback?ref=' + encodeURIComponent(ref);

export function Feedback({ route }) {
  const s = useStore();
  const ref = route.q.ref && /^\/[pc]\/[^\s]{1,120}$/.test(route.q.ref) ? route.q.ref : '';
  const label = refLabel(s.content, ref);
  const [category, setCategory] = useState(ref.startsWith('/p/') || ref.startsWith('/c/') ? 'error' : 'content');
  const [message, setMessage] = useState('');
  const [withRef, setWithRef] = useState(true);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState(null);
  const [mine, setMine] = useState(null); const [loadErr, setLoadErr] = useState(null);
  const load = () => s.api.myFeedback().then(setMine).catch(e => { setMine([]); setLoadErr(e.message); });
  useEffect(() => { load(); }, []);
  async function submit(e) {
    e.preventDefault(); const text = message.trim(); if (!text) return;
    setBusy(true); setNote(null);
    try {
      await getState().api.submitFeedback({ category, message: text, context: ref && withRef ? ref : '', device: s.device, appVersion: APP_VERSION, contentVersion: s.content?.version || '' });
      setMessage(''); setNote({ ok: true, text: '의견을 보냈습니다. 감사합니다.' }); load();
    } catch (err) { setNote({ ok: false, text: '보내지 못했습니다: ' + (err.message || err) + ' (작성한 내용은 그대로 남아 있습니다)' }); }
    setBusy(false);
  }
  return (
    <div class="page">
      <h1>의견 보내기</h1>
      <p class="small muted">틀린 정답·해설, 이해하기 어려운 설명, 불편한 화면, 바라는 기능을 관리자에게 보냅니다. 학습 기록(답안·필기)은 함께 보내지 않습니다.</p>
      <form class="card feedback-form" onSubmit={submit}>
        <label>종류<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(FEEDBACK_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {ref && <label class="check-inline"><input type="checkbox" checked={withRef} onChange={e => setWithRef(e.target.checked)} /> 대상: {label || ref} <a class="small" href={'#' + ref}>(열기)</a></label>}
        <label>내용<textarea rows={6} maxLength={2000} value={message} onInput={e => setMessage(e.target.value)} placeholder="어떤 점이 문제였는지 구체적으로 적어 주세요. (예: 정답은 3인데 해설은 4로 설명함)" required /></label>
        <div class="small muted">{message.length}/2000 · 사용 중인 기기·앱 버전이 함께 전달됩니다.</div>
        {note && <div class={note.ok ? 'notice' : 'alert'} role="status">{note.text}</div>}
        <button class="btn primary" disabled={busy || !message.trim()}>{busy ? '보내는 중…' : '보내기'}</button>
      </form>
      <section>
        <h2 class="h3">내가 보낸 의견</h2>
        {mine === null ? <p class="small muted">불러오는 중…</p> : loadErr ? <p class="small muted">목록을 불러오지 못했습니다: {loadErr}</p> : !mine.length ? <p class="small muted">아직 보낸 의견이 없습니다.</p> :
          <ul class="list feedback-mine">{mine.map(f => <li key={f.id}><span class="small muted">{when(f.created_at)} · {FEEDBACK_CATEGORY[f.category]} · </span><b class={'fb-' + f.status}>{FEEDBACK_STATUS[f.status]}</b>
            {f.context && <span class="small"> · <a href={'#' + f.context}>{refLabel(s.content, f.context) || '대상 보기'}</a></span>}
            <div class="fb-msg">{f.message}</div></li>)}</ul>}
      </section>
    </div>
  );
}
