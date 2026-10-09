import { useStore } from '../store.js';
import { problemStates, conceptStates, AREA_LABEL, CAUSES } from '../engine.js';
import { ExamBadge } from '../components/ui.jsx';

const DAY = 86400000;
export function Progress() {
  const s = useStore(); const c = s.content;
  const pst = problemStates(s.events); const cst = conceptStates(s.events);
  const rows = c.toc.map(u => {
    const cs = u.concepts.filter(id => c.conceptById[id]);
    const read = cs.filter(id => cst[id]?.readAt).length;
    const pids = [...new Set(cs.flatMap(id => c.problemsByConcept[id] || []))];
    const tried = pids.filter(p => pst[p]?.level >= 1).length;
    const ok = pids.filter(p => pst[p]?.level >= 2 && pst[p]?.status !== 'wrong').length;
    const later = pids.filter(p => pst[p]?.level === 3).length;
    return { u, n: cs.length, read, np: pids.length, tried, ok, later };
  });
  const untouched = rows.filter(r => r.read === 0 && r.tried === 0);
  // 반복되는 약점: 개념별 누적 오답, 원인별 빈도
  const weak = c.concepts.map(x => {
    let w = 0; for (const pid of c.problemsByConcept[x.id] || []) w += pst[pid]?.wrongCount || 0;
    return { x, w };
  }).filter(z => z.w >= 2).sort((a, b) => b.w - a.w).slice(0, 10);
  const causeCount = {}; for (const st of Object.values(pst)) for (const cz of Object.values(st.causes || {})) causeCount[cz] = (causeCount[cz] || 0) + 1;
  const now = Date.now();
  const week = Object.values(pst).filter(st => st.last && now - new Date(st.last.at) < 7 * DAY);
  const newOk = week.filter(st => st.level >= 2 && st.status === 'correct').length;
  const laterOk = Object.values(pst).filter(st => st.level === 3 && now - new Date(st.last.at) < 7 * DAY).length;
  const area = {}; for (const p of c.problems) { const a = (area[p.area] ||= { n: 0, t: 0, ok: 0, later: 0 }); a.n++; const st = pst[p.id]; if (st?.level) a.t++; if (st?.level >= 2 && st.status === 'correct') a.ok++; if (st?.level === 3) a.later++; }
  return (
    <div class="page">
      <h1>학습 현황</h1>
      <p class="small muted">공부 시간·출석이 아니라 이해와 문제 해결의 변화를 봅니다. ‘읽어봄’ = 개념 확인, ‘직접 풀어봄’ = 한 번 이상 제출, ‘나중에 다시 맞힘’ = 처음 시도와 다른 날에 다시 맞힘.</p>
      <section><h2 class="h3">최근 7일 변화</h2><p>맞힌 상태가 된 문제 {newOk}개 · 다른 날 다시 맞힌 문제 {laterOk}개</p></section>
      <section><h2 class="h3">영역별</h2>
        <div class="tbl" tabIndex={0}><table><thead><tr><th>영역</th><th>문항</th><th>직접 풀어봄</th><th>맞힘(현재)</th><th>나중에 다시 맞힘</th></tr></thead>
          <tbody>{Object.entries(area).map(([k, a]) => <tr key={k}><td>{AREA_LABEL[k]}</td><td>{a.n}</td><td>{a.t}</td><td>{a.ok}</td><td>{a.later}</td></tr>)}</tbody></table></div>
      </section>
      <section><h2 class="h3">단원별 기초 범위</h2>
        <div class="tbl" tabIndex={0}><table><thead><tr><th>단원</th><th>개념 읽어봄</th><th>연결 문제 풀어봄</th><th>맞힘</th><th>다시 맞힘</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.u.id} class={r.read === 0 && r.tried === 0 ? 'dim' : ''}><td><a href={'#/learn?area=' + r.u.area}>{r.u.title}</a></td><td>{r.read}/{r.n}</td><td>{r.tried}/{r.np}</td><td>{r.ok}</td><td>{r.later}</td></tr>)}</tbody></table></div>
      </section>
      <section><h2 class="h3">아직 손대지 않은 단원 ({untouched.length})</h2>{untouched.length ? <ul class="list">{untouched.map(r => <li key={r.u.id}><a href={'#/c/' + r.u.concepts[0]}>{r.u.title}</a></li>)}</ul> : <p class="small">모든 단원을 한 번 이상 확인했습니다.</p>}</section>
      <section><h2 class="h3">반복되는 약점</h2>
        {weak.length ? <ul class="list">{weak.map(({ x, w }) => <li key={x.id}><a href={'#/c/' + x.id}>{x.title}</a> <span class="small muted">연결 문제 누적 오답 {w}회</span></li>)}</ul> : <p class="small muted">같은 개념에서 2회 이상 틀린 기록이 아직 없습니다.</p>}
        {Object.keys(causeCount).length ? <p class="small">직접 고른 오답 원인: {CAUSES.filter(k => causeCount[k]).map(k => `${k} ${causeCount[k]}회`).join(' · ')}</p> : null}
      </section>
    </div>
  );
}
