import { cloneElement } from 'preact';
import { useStore } from '../store.js';
import { InkBar, InkPad, useInk, useInkPrefs } from './Ink.jsx';

export function StudyWorkspace({ route, view }) {
  const s = useStore();
  const [top, id] = route.parts;
  // 기존 문제 필기 키를 유지해 아래쪽 연습지의 필기를 그대로 옮긴다.
  const ink = useInk(top === 'p' ? id : top === 'c' ? 'concept:' + id : 'page:' + (top || 'home'));
  const [inkPrefs, setInkPrefs] = useInkPrefs();
  return <div class="study-layout">
    <main id="main" tabIndex={-1}>
      <a href="#notes" class="small note-jump" onClick={e => { e.preventDefault(); document.getElementById('notes')?.focus(); document.getElementById('notes')?.scrollIntoView({ block: 'start' }); }}>필기 공간으로 이동</a>
      {cloneElement(view, { ink, inkPrefs, setInkPrefs })}
    </main>
    <aside id="notes" class="study-notes" aria-label="필기 공간" tabIndex={-1}>
      <InkBar api={ink} prefs={inkPrefs} setPrefs={setInkPrefs} />
      <InkPad api={ink} prefs={inkPrefs} hasCode={top === 'p' && !!s.content.problemById[id]?.code} />
    </aside>
  </div>;
}
