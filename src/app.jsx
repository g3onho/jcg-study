import { useEffect, useState } from 'preact/hooks';
import { useStore, signOut } from './store.js';
import { SaveStatus } from './components/ui.jsx';
import { daysToExam } from './engine.js';
import { EXAM_LABEL } from './config.js';
import { Login } from './views/Login.jsx';
import { Home, Focus } from './views/Home.jsx';
import { Learn, Concept } from './views/Learn.jsx';
import { Practice, Problem } from './views/Practice.jsx';
import { Review } from './views/Review.jsx';
import { Progress } from './views/Progress.jsx';
import { Sources, PdfView } from './views/Sources.jsx';
import { Search } from './views/Search.jsx';
import { Settings } from './views/Settings.jsx';

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, q: Object.fromEntries(new URLSearchParams(qs || '')), raw: h };
}
export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => { const f = () => { setR(parseHash()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}

const NAV = [
  ['', '오늘의 학습', '🏠'], ['learn', '개념 학습', '📘'], ['practice', '문제 풀이', '✏️'], ['review', '오답·복습', '🔁'],
  ['progress', '학습 현황', '📈'], ['sources', '자료·검증', '📚'], ['settings', '설정·백업', '⚙️'],
];

export function App() {
  const s = useStore();
  const route = useRoute();
  if (s.booting) return <div class="boot">불러오는 중…</div>;
  if (!s.session) return <Login />;
  const top = route.parts[0] || '';
  let view;
  if (s.contentLoading && !s.content) view = <div class="boot">학습 콘텐츠를 불러오는 중…</div>;
  else if (!s.content) view = <div class="page"><div class="alert">{s.contentError || '콘텐츠가 없습니다.'}</div><p><a href="#/settings">설정</a>에서 콘텐츠 가져오기 상태를 확인하세요.</p>{top === 'settings' && <Settings />}</div>;
  else {
    switch (top) {
      case '': view = <Home />; break;
      case 'focus': view = <Focus />; break;
      case 'learn': view = <Learn route={route} />; break;
      case 'c': view = <Concept id={route.parts[1]} />; break;
      case 'practice': view = <Practice route={route} />; break;
      case 'p': view = <Problem id={route.parts[1]} route={route} />; break;
      case 'review': view = <Review route={route} />; break;
      case 'progress': view = <Progress />; break;
      case 'sources': view = <Sources route={route} />; break;
      case 'pdf': view = <PdfView id={route.parts[1]} route={route} />; break;
      case 'search': view = <Search route={route} />; break;
      case 'settings': view = <Settings />; break;
      default: view = <div class="page"><p>없는 화면입니다. <a href="#/">처음으로</a></p></div>;
    }
  }
  const d = daysToExam();
  return (
    <div class="shell">
      <a class="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a>
      <header class="top">
        <a href="#/" class="brand">정처기 실기</a>
        <span class="dday" title={EXAM_LABEL}>{d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : `시험일 +${-d}`}</span>
        <form class="topsearch" role="search" onSubmit={e => { e.preventDefault(); const v = e.currentTarget.q.value.trim(); location.hash = '#/search?q=' + encodeURIComponent(v); }}>
          <input name="q" type="search" placeholder="개념·용어·문제·출처 검색" aria-label="검색" defaultValue={top === 'search' ? route.q.q || '' : ''} />
        </form>
        <SaveStatus />
      </header>
      <nav class="side" aria-label="주 메뉴">
        {NAV.map(([k, label, ic]) => <a key={k} href={'#/' + k} class={top === k || (k === 'learn' && top === 'c') || (k === 'practice' && top === 'p') || (k === 'sources' && top === 'pdf') ? 'on' : ''}><span aria-hidden="true">{ic}</span> {label}</a>)}
        <button class="linkbtn" onClick={signOut}>로그아웃</button>
      </nav>
      <main id="main" tabIndex={-1}>{view}</main>
      <nav class="tabbar" aria-label="하단 메뉴">
        {NAV.slice(0, 4).map(([k, label, ic]) => <a key={k} href={'#/' + k} class={top === k || (k === 'learn' && top === 'c') || (k === 'practice' && top === 'p') ? 'on' : ''}><span aria-hidden="true">{ic}</span><span>{label}</span></a>)}
        <a href="#/more" class={['progress', 'sources', 'settings', 'more', 'pdf'].includes(top) ? 'on' : ''} onClick={e => { e.preventDefault(); document.querySelector('.side').classList.toggle('open'); }}><span aria-hidden="true">☰</span><span>더보기</span></a>
      </nav>
    </div>
  );
}
