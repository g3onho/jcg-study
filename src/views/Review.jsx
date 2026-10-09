import { useState } from 'preact/hooks';
import { useStore } from '../store.js';
import { problemStates, reviewQueue, LEVEL_LABEL, AREA_LABEL, CAUSES } from '../engine.js';
import { Empty, ExamBadge } from '../components/ui.jsx';

export function Review({ route }) {
  const s = useStore(); const c = s.content;
  const pst = problemStates(s.events);
  const [tab, setTab] = useState(route.q.tab || 'due');
  const [cause, setCause] = useState('');
  const due = reviewQueue(c, pst);
  const wrongs = Object.entries(pst).filter(([pid, st]) => st.wrongCount > 0 && c.problemById[pid])
    .map(([pid, st]) => ({ pid, st, causes: Object.values(st.causes) }))
    .filter(x => !cause || x.causes.includes(cause))
    .sort((a, b) => (b.st.last?.at || '').localeCompare(a.st.last?.at || ''));
  const recent = s.events.filter(e => e.type === 'attempt' && e.data.result !== 'revealed').slice(-40).reverse();
  return (
    <div class="page">
      <h1>오답과 복습</h1>
      <div class="tabs" role="tablist">
        {[['due', `우선 복습 (${due.length})`], ['wrong', `오답 노트 (${wrongs.length})`], ['log', '최근 풀이 기록']].map(([k, l]) =>
          <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'due' && (due.length ? (
        <>
          <p class="small muted">다시 볼 시점이 된 문제입니다. 밀린 개수를 쌓지 않고, 지금 중요한 순서대로만 보여 줍니다. (틀림 → 1일 뒤, 힌트·해설 사용 → 2일 뒤, 처음 맞힘 → 4일 뒤, 다른 날 다시 맞힘 → 8일 뒤. 시험 이틀 전까지는 한 번 더 보도록 간격을 줄입니다.)</p>
          <ul class="list">{due.slice(0, 30).map(x => { const p = c.problemById[x.pid]; return <li key={x.pid}><a href={'#/p/' + x.pid + '?from=review'}>{p.setTitle} {p.no}번 · {AREA_LABEL[p.area]}</a><ExamBadge problem={p} /><div class="small muted">{x.reasons.join(' · ')}</div></li>; })}</ul>
        </>) : <Empty>지금 복습할 차례인 문제가 없습니다.</Empty>)}
      {tab === 'wrong' && (
        <>
          <div class="chips">{['', ...CAUSES].map(k => <button key={k} class={'chip' + (cause === k ? ' on' : '')} aria-pressed={cause === k} onClick={() => setCause(k)}>{k || '전체 원인'}</button>)}</div>
          {wrongs.length ? <ul class="list">{wrongs.map(({ pid, st, causes }) => { const p = c.problemById[pid]; return (
            <li key={pid}><a href={'#/p/' + pid + '?from=review'}>{p.setTitle} {p.no}번 · {p.title}</a><ExamBadge problem={p} />
              <div class="small muted">오답 {st.wrongCount}회 · 현재 {st.status === 'wrong' ? '아직 오답' : LEVEL_LABEL[st.level]}{causes.length ? ' · 원인: ' + [...new Set(causes)].join(', ') : ' · 원인 미선택'}</div>
              <div class="small">관련 개념: {(p.concepts || []).map((cid, i) => <span key={cid}>{i ? ', ' : ''}<a href={'#/c/' + cid}>{c.conceptById[cid]?.title}</a></span>)}</div>
            </li>); })}</ul> : <Empty>오답 기록이 없습니다.</Empty>}
        </>
      )}
      {tab === 'log' && (recent.length ? <ul class="list">{recent.map(e => { const p = c.problemById[e.item_id]; return p ? <li key={e.id} class="small"><a href={'#/p/' + e.item_id}>{p.setTitle} {p.no}번</a><ExamBadge problem={p} /> · {e.data.result}{e.data.hints ? ` · 힌트 ${e.data.hints}` : ''} · {new Date(e.client_at || e.created_at).toLocaleString('ko-KR')} · {e.device}</li> : null; })}</ul> : <Empty>아직 풀이 기록이 없습니다.</Empty>)}
    </div>
  );
}
