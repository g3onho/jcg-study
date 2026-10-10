import { useStore, getKV, setKV } from '../store.js';
import { problemStates, conceptStates, focusSession } from '../engine.js';
import { focusHref, focusPosition } from '../study-links.js';

// 집중 학습 중일 때 다음 항목으로 바로 이어 주는 막대. skip이면 '건너뛰기' 링크만 보여 준다.
export function FocusNext({ kind, id, skip = false }) {
  const s = useStore(); const c = s.content;
  const pos = focusPosition(getKV('focus')?.items, kind, id);
  if (!pos) return null;
  const { next, index, total } = pos;
  if (skip) return next ? <a class="btn ghost" href={focusHref(next)}>건너뛰기 →</a> : null;
  function more() {
    const items = focusSession(c, conceptStates(s.events), problemStates(s.events))
      .filter(it => !(it.kind === kind && (kind === 'concept' ? it.cid : it.pid) === id));
    if (!items.length) { location.hash = '#/focus'; return; }
    setKV('focus', { created: new Date().toISOString(), items });
    location.hash = focusHref(items[0]).slice(1);
  }
  return (
    <div class="focusbar row wrap">
      <span class="small muted">집중 학습 {index + 1}/{total}</span>
      {next
        ? <a class="btn primary" href={focusHref(next)}>{next.kind === 'concept' ? '다음: 개념 보기' : '다음 문제'} →</a>
        : <><span class="small">이번 묶음을 모두 확인했습니다.</span><button class="btn primary" onClick={more}>이어서 새 묶음 풀기 →</button></>}
      <a class="small" href="#/focus">묶음 목록</a>
    </div>
  );
}
