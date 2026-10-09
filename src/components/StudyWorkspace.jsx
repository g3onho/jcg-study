import { cloneElement } from 'preact';
import { useStore } from '../store.js';
import { InkBar, InkPad, useInk, useInkPrefs } from './Ink.jsx';

export function StudyWorkspace({ route, view }) {
  const s = useStore();
  const [top, id] = route.parts;
  // 기존 문제 필기 키를 유지해 아래쪽 연습지의 필기를 그대로 옮긴다.
  const ink = useInk(top === 'p' ? id : top === 'c' ? 'concept:' + id : top === 'exam' && id ? 'exam:' + id : 'page:' + (top || 'home'));
  const [inkPrefs, setInkPrefs] = useInkPrefs();
  const hasCode = top === 'p' && !!s.content.problemById[id]?.code;
  return <div class="study-layout">
    <main id="main" tabIndex={-1}>
      {cloneElement(view, { ink, inkPrefs, setInkPrefs })}
    </main>
    <aside id="notes" class="study-notes" aria-label="필기 공간" tabIndex={-1}>
      {top === 'c' && <p class="small"><b>{s.content.conceptById[id]?.title}</b><br /><span class="muted">개념별로 필기를 따로 저장합니다.</span></p>}
      <InkBar api={ink} prefs={inkPrefs} setPrefs={setInkPrefs} hasCode={hasCode} />
      <InkPad api={ink} prefs={inkPrefs} title={top === 'c' ? '개념 필기장' : '연습지'} hasCode={hasCode} />
    </aside>
  </div>;
}
