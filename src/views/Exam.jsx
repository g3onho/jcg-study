import { useEffect, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useStore, getState, addEvent, setKV, getKV } from '../store.js';
import { AREA_LABEL } from '../engine.js';
import { AnswerInput, QuestionBody, LANG_LABEL } from '../components/Question.jsx';
import { Md } from '../components/ui.jsx';
import { Explanation } from './Practice.jsx';
import { examCatalog, examProblems, examKey, heldProblemIds, defaultMinutes, scoreExam, newRun, attemptsToRecord, historyEntry, fmtClock, isBlank } from '../exam.js';

const STATE_LABEL = { correct: '정답', partial: '부분 정답', wrong: '오답', blank: '미응답', self_pending: '자기 채점 필요', self_correct: '맞힘(자기 채점)', self_partial: '일부만(자기 채점)', self_wrong: '틀림(자기 채점)' };
const STATE_CLASS = { correct: 'r-correct', self_correct: 'r-correct', partial: 'r-partial', self_partial: 'r-partial', wrong: 'r-wrong', self_wrong: 'r-wrong', blank: '', self_pending: 'r-partial' };
const fmtScore = sc => (sc.score == null ? '—' : sc.score.toFixed(1).replace(/\.0$/, '') + '점');
const dateText = iso => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- 목록: 연도 → 회차 ----------
export function ExamList() {
  const s = useStore(); const c = s.content;
  const cat = examCatalog(c);
  const status = id => {
    const r = getKV(examKey(id));
    if (r?.status === 'running') return { text: `진행 중 · ${Object.values(r.answers || {}).filter(a => (a.text || '').trim() || (a.parts || []).some(x => (x || '').trim())).length}문항 작성`, on: true };
    const h = r?.history?.[0];
    if (h) return { text: `최근 ${h.score == null ? '채점 대기' : h.score.toFixed(1).replace(/\.0$/, '') + '점'} · ${r.history.length}회 응시` };
    return { text: '아직 응시하지 않음' };
  };
  const Item = ({ it, label }) => { const st = status(it.id); return (
    <li><a href={'#/exam/' + encodeURIComponent(it.id)} class={st.on ? 'exam-on' : ''}>
      <span class="exam-name">{label}</span>
      <span class="exam-meta small muted">복원 {it.count}문항 · {st.text}</span>
    </a></li>); };
  return (
    <div class="page">
      <h1>모의시험</h1>
      <p class="small muted">한 회차를 실제 시험처럼 처음부터 끝까지 한 번에 풉니다. 제출하기 전에는 힌트·정답·해설이 열리지 않고, 제출하면 한꺼번에 채점합니다. 중간에 나가도 작성한 답과 사용한 시간이 저장되어 다른 기기에서도 이어서 풀 수 있습니다.</p>
      <div class="notice small">복원 기출은 일부 회차가 전체 문항이 아니라 <b>복원된 문항만</b> 들어 있습니다(각 회차의 문항 수를 확인하세요). 점수는 맞힌 비율을 100점으로 환산한 <b>연습용</b> 값이며 공식 채점 기준·합격선이 아닙니다.</div>
      {cat.years.map(y => (
        <section key={y.year}>
          <h2 class="h3">{y.year}년</h2>
          <ul class="exam-list">{y.rounds.map(r => <Item key={r.id} it={r} label={`${r.year}년 ${r.round}회`} />)}</ul>
        </section>
      ))}
      {cat.mocks.length > 0 && <section>
        <h2 class="h3">모의고사</h2>
        <ul class="exam-list">{cat.mocks.map(m => <Item key={m.id} it={m} label={m.title} />)}</ul>
      </section>}
      <p class="small muted">한 문제씩 힌트와 함께 연습하려면 <a href="#/practice">문제 풀이</a>를 이용하세요.</p>
    </div>
  );
}

// ---------- 한 회차 ----------
export function Exam({ id }) {
  const s = useStore(); const c = s.content;
  const setInfo = c.setById?.[id];
  const problems = examProblems(c, id);
  if (!setInfo || !problems.length) return <div class="page"><p>시험 묶음을 찾을 수 없습니다. <a href="#/exam">모의시험 목록</a></p></div>;
  const held = heldProblemIds(c);
  const saved = getKV(examKey(id));
  const crumbs = <div class="crumbs small"><a href="#/exam">모의시험</a> · {setInfo.title}</div>;
  if (saved?.status === 'running') return <div class="page exam">{crumbs}<ExamRun key={saved.runId} id={id} title={setInfo.title} problems={problems} held={held} saved={saved} /></div>;
  if (saved?.status === 'submitted') return <div class="page exam">{crumbs}<ExamResult key={saved.runId} id={id} title={setInfo.title} problems={problems} held={held} run={saved} /></div>;
  return <div class="page exam">{crumbs}<ExamStart id={id} title={setInfo.title} problems={problems} held={held} history={saved?.history || []} /></div>;
}

function ExamStart({ id, title, problems, held, history }) {
  const def = defaultMinutes(problems.length);
  const [limited, setLimited] = useState(true);
  const [minutes, setMinutes] = useState(String(def));
  const areas = {}; for (const p of problems) areas[p.area] = (areas[p.area] || 0) + 1;
  const heldN = problems.filter(p => held.has(p.id)).length;
  function start() {
    const min = Math.max(1, Math.min(300, Math.round(Number(minutes)) || def));
    setKV(examKey(id), { ...newRun(problems, limited ? min : 0), history }, 0);
  }
  return (
    <>
      <h1>{title} 모의시험</h1>
      <div class="card exam-start">
        <p><b>{problems.length}문항</b> · {Object.entries(areas).map(([k, n]) => `${AREA_LABEL[k] || k} ${n}`).join(' · ')}</p>
        <ul class="small">
          <li>모든 문항이 한 화면에 나옵니다. 번호 버튼으로 이동하고, 아무 때나 나갔다가 이어서 풀 수 있습니다.</li>
          <li>제출 전에는 힌트·정답·해설을 볼 수 없습니다. 오른쪽(모바일은 아래) 연습지에 풀이를 적을 수 있습니다.</li>
          <li>제출하면 문항별로 채점해 오답·복습 기록에 남깁니다. 답을 쓰지 않은 문항은 기록에 남기지 않고 0점으로만 계산합니다.</li>
          {heldN > 0 && <li>정답 충돌이 풀리지 않은 {heldN}문항은 점수에서 제외하고 참고로만 보여 줍니다.</li>}
        </ul>
        <div class="exam-time">
          <label class="check-inline"><input type="checkbox" checked={limited} onChange={e => setLimited(e.target.checked)} /> 시간 제한</label>
          <label class={'check-inline' + (limited ? '' : ' off')}><input type="number" inputMode="numeric" min="1" max="300" value={minutes} disabled={!limited} onInput={e => setMinutes(e.target.value)} aria-label="제한 시간(분)" /> 분</label>
        </div>
        <p class="small muted">기본 시간은 문항당 7.5분(20문항 150분 기준)으로 계산한 연습용 값입니다. 실제 시험 시간·방식은 큐넷 공고에서 확인하세요. 시간은 이 화면을 열어 둔 동안만 흐릅니다. 시간이 다 되면 자동으로 제출됩니다.</p>
        <button class="btn primary" onClick={start}>시험 시작</button>
      </div>
      {history.length > 0 && <HistoryList history={history} />}
    </>
  );
}

function HistoryList({ history }) {
  return (
    <section>
      <h2 class="h3">이 회차 응시 기록</h2>
      <ul class="list small">{history.map(h => <li key={h.runId}>{dateText(h.submittedAt)} · {h.score == null ? '채점 대기' : h.score.toFixed(1).replace(/\.0$/, '') + '점'} ({h.answered}/{h.n}문항 응답{h.max != null ? ` · 맞힌 비율 ${Math.round(h.earned * 10) / 10}/${h.max}` : ''}) · 걸린 시간 {fmtClock(h.usedSec)}{h.limitMin ? ` / 제한 ${h.limitMin}분` : ''}</li>)}</ul>
    </section>
  );
}

// 1초마다 다시 그려야 하는 시계만 따로 둔다(문제 전체가 매초 다시 그려지지 않게).
function Clock({ startSec, limitMin, onSecond, onExpire }) {
  const [used, setUsed] = useState(startSec);
  const ref = useRef({ onSecond, onExpire });
  ref.current = { onSecond, onExpire };
  useEffect(() => {
    let u = startSec;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // 화면을 보고 있는 동안만 시간이 흐른다
      u += 1; setUsed(u); ref.current.onSecond(u);
      if (limitMin && u >= limitMin * 60) { clearInterval(t); ref.current.onExpire(u); }
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const left = limitMin ? limitMin * 60 - used : null;
  return (
    <span class={'xclock' + (left != null && left <= 300 ? ' low' : '')} role="timer" aria-label={left != null ? '남은 시간' : '경과 시간'}>
      {left != null ? `남은 ${fmtClock(left)}` : `경과 ${fmtClock(used)}`}
    </span>
  );
}

const ExamQuestion = memo(function ExamQuestion({ p, initial, onChange, held }) {
  const [ans, setAns] = useState({ text: initial?.text || '', parts: initial?.parts || [] });
  const update = next => { setAns(next); onChange(p.id, next); };
  return (
    <section id={'xq-' + p.no} class="xq">
      <h2 class="h3">{p.no}번 <span class="muted small">{AREA_LABEL[p.area]}{p.lang ? ' · ' + LANG_LABEL[p.lang] : ''}</span>{held && <span class="vb v-check" title="정답 충돌 미해결">점수 제외</span>}</h2>
      <div class="qbox"><QuestionBody p={p} /></div>
      <AnswerInput spec={p.grading} ans={ans} update={update} />
      {p.grading.answerHint && <div class="small muted">{p.grading.answerHint}</div>}
      {p.grading.mode === 'self' && <div class="small muted">서술형입니다. 제출한 뒤 모범 답안과 비교해 스스로 채점합니다.</div>}
    </section>
  );
});

function ExamRun({ id, title, problems, held, saved }) {
  const key = examKey(id);
  const answersRef = useRef(saved.answers || {});
  const initialRef = useRef(saved.answers || {});
  const usedRef = useRef(saved.usedSec || 0);
  const doneRef = useRef(false);
  const [count, setCount] = useState(() => problems.filter(p => !isBlank(p.grading, saved.answers?.[p.id])).length);
  const [marks, setMarks] = useState(() => new Set(problems.filter(p => !isBlank(p.grading, saved.answers?.[p.id])).map(p => p.id)));
  const [confirming, setConfirming] = useState(false);
  const snapshot = (extra = {}) => ({ ...saved, answers: answersRef.current, usedSec: usedRef.current, ...extra });
  const persist = (ms = 900) => { if (!doneRef.current) setKV(key, snapshot(), ms); };

  useEffect(() => {
    setKV('pos', { hash: '/exam/' + id, title: `모의시험: ${title} (진행 중)`, at: new Date().toISOString(), device: getState().device }, 1500);
    const leave = () => persist(0);
    document.addEventListener('visibilitychange', leave);
    return () => { document.removeEventListener('visibilitychange', leave); leave(); };
  }, []);

  const onChangeRef = useRef(null);
  const stableChange = useRef((pid, ans) => onChangeRef.current(pid, ans)).current; // 질문 컴포넌트가 입력마다 다시 그려지지 않게 고정된 함수를 넘긴다
  onChangeRef.current = onChange;
  function onChange(pid, ans) {
    answersRef.current = { ...answersRef.current, [pid]: ans };
    const p = problems.find(x => x.id === pid);
    const filled = !isBlank(p.grading, ans);
    setMarks(prev => { if (prev.has(pid) === filled) return prev; const n = new Set(prev); filled ? n.add(pid) : n.delete(pid); setCount(n.size); return n; });
    persist(900);
  }
  function submit(timedOut = false) {
    if (doneRef.current) return; doneRef.current = true;
    const run = { ...snapshot(), status: 'submitted', submittedAt: new Date().toISOString(), timedOut };
    const sc = scoreExam(problems, run.answers, run.selfMarks, held);
    for (const a of attemptsToRecord(problems, run, held)) addEvent('attempt', a.pid, a.data);
    run.history = [historyEntry(run, sc), ...(saved.history || [])].slice(0, 20);
    setKV(key, run, 0);
    window.scrollTo(0, 0);
  }
  const jump = no => document.getElementById('xq-' + no)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const blanks = problems.length - count;
  return (
    <>
      <div class="xbar" role="region" aria-label="시험 진행 상태">
        <div class="xbar-top">
          <b class="xtitle">{title}</b>
          <Clock startSec={usedRef.current} limitMin={saved.limitMin} onSecond={u => { usedRef.current = u; if (u % 10 === 0) persist(300); }} onExpire={u => { usedRef.current = u; submit(true); }} />
          <span class="small muted">{count}/{problems.length} 작성</span>
          <button class="btn small primary" onClick={() => setConfirming(true)}>제출</button>
        </div>
        <div class="xnav" role="group" aria-label="문항 이동">
          {problems.map(p => <button key={p.id} class={'xchip' + (marks.has(p.id) ? ' on' : '')} onClick={() => jump(p.no)} aria-label={`${p.no}번으로 이동${marks.has(p.id) ? ' (작성함)' : ''}`}>{p.no}</button>)}
        </div>
        {confirming && <div class="xconfirm" role="alertdialog" aria-label="제출 확인">
          <p>제출하면 채점·정답·해설이 열리고 이 회차의 답안은 더 고칠 수 없습니다.{blanks > 0 ? ` 아직 답을 쓰지 않은 문항이 ${blanks}개 있습니다(0점 처리).` : ''}</p>
          <div class="row"><button class="btn primary" onClick={() => submit(false)}>제출하고 채점하기</button><button class="btn" onClick={() => setConfirming(false)}>계속 풀기</button></div>
        </div>}
      </div>
      {saved.limitMin > 0 && <p class="small muted">제한 시간 {saved.limitMin}분 · 시간이 다 되면 자동으로 제출됩니다. 이 화면을 닫아 두는 동안에는 시간이 흐르지 않습니다.</p>}
      {problems.map(p => <ExamQuestion key={p.id} p={p} initial={initialRef.current[p.id]} onChange={stableChange} held={held.has(p.id)} />)}
      <div class="row wrap"><button class="btn primary" onClick={() => setConfirming(true)}>제출</button>
        <button class="btn ghost" onClick={() => { if (!count || confirm('이 회차의 작성 내용과 사용한 시간을 지우고 처음부터 다시 시작할까요?')) { doneRef.current = true; setKV(key, { status: 'ready', history: saved.history || [] }, 0); } }}>이 시도 버리고 처음부터</button></div>
    </>
  );
}

function ExamResult({ id, title, problems, held, run }) {
  const key = examKey(id);
  const sc = scoreExam(problems, run.answers, run.selfMarks, held);
  const byId = Object.fromEntries(sc.items.map(i => [i.pid, i]));
  const areas = {};
  for (const p of problems) { const i = byId[p.id]; if (i.held) continue; const a = (areas[p.area] ||= { n: 0, earned: 0 }); a.n++; a.earned += i.earned; }
  function selfMark(p, mark) {
    const marks = { ...(run.selfMarks || {}), [p.id]: mark };
    const next = { ...run, selfMarks: marks };
    const nsc = scoreExam(problems, next.answers, marks, held);
    if (next.history?.[0]?.runId === run.runId) next.history = [historyEntry(run, nsc, new Date(run.submittedAt)), ...next.history.slice(1)];
    addEvent('attempt', p.id, { result: 'self_' + mark, hints: 0, revealed: true, answer: run.answers?.[p.id], parts: [], near: false, mode: 'exam', exam: id, run: run.runId });
    setKV(key, next, 0);
  }
  function again() { setKV(key, { status: 'ready', history: run.history || [] }, 0); window.scrollTo(0, 0); }
  return (
    <>
      <h1>{title} 결과</h1>
      <div class="card exam-score">
        <div class="exam-score-n">{fmtScore(sc)}</div>
        <div class="small muted">100점 환산 (연습용) · 맞힌 비율 {Math.round(sc.earned * 10) / 10}/{sc.max} · {sc.answered}/{problems.length}문항 응답</div>
        <div class="small">걸린 시간 {fmtClock(run.usedSec)}{run.limitMin ? ` / 제한 ${run.limitMin}분` : ''}{run.timedOut ? ' · 시간이 다 되어 자동 제출됨' : ''} · {dateText(run.submittedAt)}</div>
        {sc.pending > 0 && <p class="small">자기 채점이 필요한 서술형 {sc.pending}문항이 있습니다. 아래에서 모범 답안과 비교해 표시하면 점수에 반영됩니다.</p>}
        {sc.heldCount > 0 && <p class="small muted">정답 충돌이 풀리지 않은 {sc.heldCount}문항은 점수에서 제외했습니다.</p>}
        <p class="small muted">빈칸이 여러 개인 문제는 맞힌 빈칸 비율만큼 부분 점수로 계산했습니다. 공식 배점·채점 기준이 아니므로 학습 상태를 가늠하는 참고용입니다.</p>
        <div class="row wrap"><button class="btn primary" onClick={again}>이 회차 다시 풀기</button><a class="btn" href="#/exam">다른 회차 고르기</a><a class="btn" href="#/review?tab=wrong">오답 노트</a></div>
      </div>
      {Object.keys(areas).length > 1 && <section><h2 class="h3">영역별</h2>
        <div class="tbl" tabIndex={0}><table><thead><tr><th>영역</th><th>문항</th><th>맞힌 비율</th></tr></thead>
          <tbody>{Object.entries(areas).map(([k, a]) => <tr key={k}><td>{AREA_LABEL[k] || k}</td><td>{a.n}</td><td>{Math.round(a.earned * 10) / 10}/{a.n} ({Math.round(a.earned / a.n * 100)}%)</td></tr>)}</tbody></table></div></section>}
      <section>
        <h2 class="h3">문항별 채점</h2>
        {problems.map(p => {
          const i = byId[p.id]; const ans = run.answers?.[p.id];
          const open = !i.held && i.state !== 'correct' && i.state !== 'self_correct';
          return (
            <details key={p.id} class={'xr ' + (i.held ? '' : STATE_CLASS[i.state] || '')} open={open}>
              <summary><b>{p.no}번</b> <span class="small muted">{AREA_LABEL[p.area]}{p.lang ? ' · ' + LANG_LABEL[p.lang] : ''}</span> <span class="xr-state">{i.held ? '점수 제외' : STATE_LABEL[i.state] || i.state}{!i.held && i.state !== 'blank' && i.state !== 'self_pending' ? ` ${Math.round(i.earned * 100) / 100}/${i.max}` : ''}</span></summary>
              <div class="qbox"><QuestionBody p={p} /></div>
              <div class="small">내 답안<pre class="pre">{ans && (ans.text || (ans.parts || []).map((x, k) => (p.grading.parts?.[k]?.label ? p.grading.parts[k].label + ': ' : '') + (x || '(빈칸)')).join('\n')) || '(작성하지 않음)'}</pre></div>
              {p.grading.mode === 'self' && <SelfPanel p={p} mark={run.selfMarks?.[p.id]} blank={i.state === 'blank'} onMark={m => selfMark(p, m)} />}
              {i.held && <div class="alert warn small">이 문항은 자료의 정답·본문 충돌이 풀리지 않아 점수와 기록에서 제외했습니다. 해설은 참고용입니다.</div>}
              <Explanation p={p} spec={p.grading} />
              <div class="small"><a href={'#/p/' + p.id}>이 문제를 문제 풀이 화면에서 다시 풀기</a></div>
            </details>
          );
        })}
      </section>
      {(run.history || []).length > 0 && <HistoryList history={run.history} />}
    </>
  );
}

function SelfPanel({ p, mark, blank, onMark }) {
  const spec = p.grading;
  const [checks, setChecks] = useState({});
  return (
    <div class="selfgrade">
      <h3 class="h4">모범 답안</h3><Md text={'```\n' + spec.model + '\n```'} />
      {spec.checklist && <><h3 class="h4">필수 요소 체크</h3>
        <ul class="checks">{spec.checklist.map((x, i) => <li key={i}><label><input type="checkbox" checked={!!checks[i]} onChange={e => setChecks({ ...checks, [i]: e.target.checked })} /> {x}</label></li>)}</ul></>}
      <p class="small muted">공식 채점 기준이 없는 문제입니다. 체크리스트로 스스로 판단한 연습용 결과입니다.{blank ? ' 답을 쓰지 않은 문항은 0점으로 계산합니다.' : ''}</p>
      {!blank && <div class="row"><span class="small">내 판단:</span>{[['correct', '맞힘', 'ok'], ['partial', '일부만', ''], ['wrong', '틀림', 'bad']].map(([m, l, cls]) =>
        <button key={m} class={'btn small ' + cls} aria-pressed={mark === m} disabled={!!mark} onClick={() => onMark(m)}>{l}{mark === m ? ' ✓' : ''}</button>)}</div>}
    </div>
  );
}
