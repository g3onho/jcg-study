import { useStore } from '../store.js';
import { problemStates, AREA_LABEL } from '../engine.js';
import { ExamBadge } from '../components/ui.jsx';

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
export function Search({ route }) {
  const s = useStore(); const c = s.content; const pst = problemStates(s.events);
  const q = (route.q.q || '').trim(); const nq = norm(q);
  if (!q) return <div class="page"><h1>검색</h1><p class="muted">위 검색창에 개념·용어·문제·출처를 입력하세요.</p></div>;
  const hit = t => norm(t).includes(nq);
  const concepts = c.concepts.filter(x => hit(x.title) || (x.keywords || []).some(hit) || hit(x.summary) || hit(x.definition) || hit(x.easy) || hit(x.compare));
  const terms = (c.terms || []).filter(t => hit(t.term) || (t.alias || []).some(hit));
  // 정답·해설 문구는 풀어 본 문제에서만 검색(풀기 전 답 노출 방지)
  const problems = c.problems.filter(p => hit(p.title) && (p.area !== 'theory' || pst[p.id]?.level) || hit(p.prompt) || hit(p.code) || (pst[p.id]?.level && hit(p.answer_display)));
  const files = c.files.filter(f => hit(f.title) || hit(f.path) || hit(f.topic));
  return (
    <div class="page">
      <h1>‘{q}’ 검색 결과</h1>
      <section><h2 class="h3">개념 ({concepts.length})</h2><ul class="list">{concepts.slice(0, 30).map(x => <li key={x.id}><a href={'#/c/' + x.id}>{x.title}</a><ExamBadge conceptId={x.id} /> <span class="small muted">{x.summary}</span></li>)}</ul></section>
      {terms.length ? <section><h2 class="h3">용어 ({terms.length})</h2><ul class="list">{terms.slice(0, 30).map(t => <li key={t.term}><b>{t.term}</b> — {t.def} {t.concept && <a href={'#/c/' + t.concept} class="small">개념 보기</a>}</li>)}</ul></section> : null}
      <section><h2 class="h3">문제 ({problems.length})</h2><ul class="list">{problems.slice(0, 50).map(p => <li key={p.id}><a href={'#/p/' + p.id}>{p.setTitle} {p.no}번 · {AREA_LABEL[p.area]}</a><ExamBadge problem={p} /></li>)}</ul></section>
      {s.isAdmin && <section><h2 class="h3">원본 자료 ({files.length})</h2><ul class="list">{files.map(f => <li key={f.id}><a href={'#/pdf/' + f.id}>{f.title}</a> <span class="small muted">{f.path}</span></li>)}</ul></section>}
      <p class="small muted">아직 풀지 않은 이론 문제는 주제명으로 검색되지 않습니다(답 노출 방지).</p>
    </div>
  );
}
