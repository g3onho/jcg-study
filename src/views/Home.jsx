import { useStore, getKV, setKV } from '../store.js';
import { problemStates, conceptStates, reviewQueue, recommendConcept, recommendProblem, focusSession, daysToExam, AREA_LABEL } from '../engine.js';
import { EXAM_LABEL } from '../config.js';
import { Empty, ExamBadge } from '../components/ui.jsx';

export function useDerived() {
  const s = useStore();
  const pst = problemStates(s.events);
  const cst = conceptStates(s.events);
  return { s, c: s.content, pst, cst };
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return '방금'; if (m < 60) return m + '분 전'; const h = Math.round(m / 60); if (h < 24) return h + '시간 전'; return Math.round(h / 24) + '일 전';
}

export function Home() {
  const { s, c, pst, cst } = useDerived();
  const pos = getKV('pos');
  const q = reviewQueue(c, pst).slice(0, 5);
  const rc = recommendConcept(c, cst, pst);
  const rp = recommendProblem(c, cst, pst);
  const d = daysToExam();
  const unreadCore = c.concepts.filter(x => !cst[x.id]?.readAt).length;
  const untried = c.problems.filter(p => !pst[p.id]?.level).length;
  return (
    <div class="page home">
      <h1>오늘의 학습</h1>
      <p class="muted small">{EXAM_LABEL} · {d > 0 ? `${d}일 남음` : d === 0 ? '오늘' : '시험일이 지났습니다'} · 정해진 분량은 없습니다. 지금 할 수 있는 만큼만.</p>

      {pos && pos.hash && (
        <a class="card resume" href={'#' + pos.hash}>
          <div class="eyebrow">이어서 학습</div>
          <div class="big">{pos.title}</div>
          <div class="muted small">{ago(pos.at)} · {pos.device}{pos.draft ? ' · 작성 중인 답안 있음' : ''}</div>
        </a>
      )}

      <div class="modes">
        <a class="mode" href={rp ? '#/p/' + rp.pid + '?from=quick' : '#/practice'}>
          <b>짧게 한 문제</b><span class="small muted">{rp ? rp.reason : '추천할 문제가 없습니다'}</span>
        </a>
        <a class="mode" href={rc ? '#/c/' + rc.concept.id : '#/learn'}>
          <b>개념 하나</b><span class="small muted">{rc ? `${rc.concept.title} — ${rc.reason}` : ''}</span>
        </a>
        <a class="mode" href="#/focus">
          <b>집중 학습</b><span class="small muted">복습·개념·새 문제를 영역별로 섞은 묶음</span>
        </a>
      </div>

      <section>
        <h2>우선 복습하면 좋은 문제</h2>
        {q.length ? (
          <ul class="list">{q.map(x => { const p = c.problemById[x.pid]; return <li key={x.pid}><a href={'#/p/' + x.pid + '?from=review'}>{p.setTitle} {p.no}번 · {AREA_LABEL[p.area]}</a><ExamBadge problem={p} /><div class="small muted">{x.reasons.join(' · ')}</div></li>; })}</ul>
        ) : <Empty>지금 다시 볼 차례인 문제가 없습니다. 틀리거나 힌트를 쓴 문제는 1~2일 뒤 여기에 나타납니다.</Empty>}
      </section>

      {rc && (
        <section>
          <h2>다음 추천 개념</h2>
          <a class="card" href={'#/c/' + rc.concept.id}><b>{rc.concept.title}</b><div class="small muted">{rc.reason}</div></a>
        </section>
      )}

      <section class="small muted">
        아직 확인하지 않은 개념 {unreadCore}개 · 아직 풀지 않은 문제 {untried}개 — <a href="#/progress">학습 현황</a>
        <div>추천은 저장된 풀이 기록(정답 여부·힌트·재풀이·미학습 범위·남은 기간)으로 계산한 규칙입니다. <a href="#/settings#rules">규칙 보기</a></div>
      </section>
    </div>
  );
}

export function Focus() {
  const { c, pst, cst } = useDerived();
  const saved = getKV('focus');
  const fresh = saved && Date.now() - new Date(saved.created) < 12 * 3600e3 && saved.items?.every(it => it.kind === 'concept' ? c.conceptById[it.cid] : c.problemById[it.pid]);
  const items = fresh ? saved.items : focusSession(c, cst, pst);
  if (!fresh && items.length) setTimeout(() => setKV('focus', { created: new Date().toISOString(), items }), 0);
  return (
    <div class="page">
      <h1>집중 학습</h1>
      <p class="muted small">복습할 문제 → 추천 개념 → 영역을 섞은 새 문제 순서입니다. 순서는 지키지 않아도 됩니다. 중간에 그만두어도 기록과 작성 중인 답안은 저장됩니다. 이 묶음은 12시간 동안 유지됩니다.</p>
      <button class="btn small" onClick={() => setKV('focus', { created: new Date().toISOString(), items: focusSession(c, cst, pst) })}>새 묶음 만들기</button>
      <ol class="list">
        {items.map((it, i) => {
          if (it.kind === 'concept') { const x = c.conceptById[it.cid]; const done = !!cst[it.cid]?.readAt; return <li key={i} class={done ? 'done' : ''}><a href={'#/c/' + it.cid}>📘 {x.title}</a>{done && ' ✓'}<div class="small muted">{it.reason}</div></li>; }
          const p = c.problemById[it.pid]; const st = pst[it.pid];
          return <li key={i} class={st?.level ? 'done' : ''}><a href={'#/p/' + it.pid + '?from=focus'}>✏️ {p.setTitle} {p.no}번 · {AREA_LABEL[p.area]}</a><ExamBadge problem={p} />{st?.level ? ' ✓' : ''}<div class="small muted">{it.reason}</div></li>;
        })}
      </ol>
    </div>
  );
}
