import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, addEvent, setKV, getKV, resolveConflict } from '../store.js';
import { problemStates, conceptStates, recommendProblem, LEVEL_LABEL, AREA_LABEL, CAUSES } from '../engine.js';
import { grade } from '../grading.js';
import { Md, Code, Table, VBadges, VDetails, OriginBadge, SourceRef, SignedImg, Empty } from '../components/ui.jsx';
import { InkBar, InkCodeLayer, InkPad, useInk, useInkPrefs } from '../components/Ink.jsx';

const LANG_LABEL = { c: 'C', java: 'Java', python: 'Python', sql: 'SQL' };

export function Practice({ route }) {
  const s = useStore(); const c = s.content;
  const pst = problemStates(s.events);
  const q = route.q;
  const [area, setArea] = useState(q.area || '');
  const [lang, setLang] = useState(q.lang || '');
  const [set, setSet] = useState(q.set || '');
  const [status, setStatus] = useState(q.status || '');
  const [text, setText] = useState(q.q || '');
  const sets = c.sets;
  const list = c.problems.filter(p => p.status !== 'hidden'
    && (!area || p.area === area) && (!lang || p.lang === lang) && (!set || p.set === set)
    && (!status || statusKey(pst[p.id]) === status)
    && (!text || (p.title + ' ' + (p.prompt || '') + ' ' + (p.code || '') + ' ' + p.setTitle).toLowerCase().includes(text.toLowerCase())));
  const groups = {};
  for (const p of list) (groups[p.set] ||= []).push(p);
  return (
    <div class="page">
      <h1>문제 풀이</h1>
      <div class="filters">
        <select aria-label="영역" value={area} onChange={e => setArea(e.target.value)}><option value="">전체 영역</option>{Object.entries(AREA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="언어" value={lang} onChange={e => setLang(e.target.value)}><option value="">전체 언어</option>{['c', 'java', 'python', 'sql'].map(k => <option key={k} value={k}>{LANG_LABEL[k]}</option>)}</select>
        <select aria-label="문제 묶음" value={set} onChange={e => setSet(e.target.value)}><option value="">전체 묶음</option>{sets.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
        <select aria-label="상태" value={status} onChange={e => setStatus(e.target.value)}><option value="">전체 상태</option><option value="0">미풀이</option><option value="wrong">마지막 시도 오답</option><option value="2">맞힘</option><option value="3">나중에 다시 맞힘</option></select>
        <input type="search" placeholder="문제 내용 검색" aria-label="문제 내용 검색" value={text} onInput={e => setText(e.target.value)} />
      </div>
      <p class="small muted">{list.length}문항 · 같은 문제가 여러 자료에 실린 경우 대표 문항 하나만 셉니다.</p>
      {Object.entries(groups).map(([sid, ps]) => (
        <section key={sid}>
          <h2 class="h3">{c.setById[sid]?.title} <span class="muted small">({ps.length})</span></h2>
          <ul class="plist">{ps.map(p => { const st = pst[p.id]; return (
            <li key={p.id}><a href={'#/p/' + p.id}>
              <span class="pno">{p.no}</span>
              <span class="ptitle">{AREA_LABEL[p.area]}{p.lang && p.area === 'code' ? ' · ' + LANG_LABEL[p.lang] : ''}{st?.level || p.area !== 'theory' ? ' · ' + p.title : ''}</span>
              <span class={'st st' + (st?.level || 0) + (st?.status === 'wrong' ? ' stw' : '')}>{st?.status === 'wrong' ? '오답' : LEVEL_LABEL[st?.level || 0]}</span>
            </a></li>); })}</ul>
        </section>
      ))}
    </div>
  );
}
function statusKey(st) { if (!st?.level) return '0'; if (st.status === 'wrong') return 'wrong'; return String(st.level); }

function draftKey(id) { return 'draft:' + id; }

export function Problem({ id, route }) {
  const s = useStore(); const c = s.content;
  const p = c.problemById[id];
  const pst = problemStates(s.events); const cst = conceptStates(s.events);
  const st = pst[id];
  const [phase, setPhase] = useState('solve'); // solve | result
  const [hintN, setHintN] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [res, setRes] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [showImg, setShowImg] = useState(!!p?.prefer_image);
  const [showTitle, setShowTitle] = useState(false);
  const [selfChecks, setSelfChecks] = useState({});
  const draft = getKV(draftKey(id)) || {};
  const [ans, setAns] = useState(() => ({ text: draft.text || '', parts: draft.parts || [] }));
  const conflict = s.conflicts[draftKey(id)];
  const ink = useInk(id);
  const [inkPrefs, setInkPrefs] = useInkPrefs();

  useEffect(() => {
    setPhase('solve'); setHintN(0); setRevealed(false); setRes(null); setLastAttempt(null); setShowImg(!!p?.prefer_image); setShowTitle(false); setSelfChecks({});
    const d = getKV(draftKey(id)) || {}; setAns({ text: d.text || '', parts: d.parts || [] });
    if (p) setKV('pos', { hash: '/p/' + id, title: `${p.setTitle} ${p.no}번 (${AREA_LABEL[p.area]})`, at: new Date().toISOString(), device: s.device }, 1500);
  }, [id]);

  if (!p) return <div class="page"><p>문제를 찾을 수 없습니다.</p></div>;
  const spec = p.grading;

  function update(next) {
    setAns(next);
    setKV(draftKey(id), { ...next, at: new Date().toISOString() }, 900);
  }
  function submit(selfResult) {
    let g;
    if (spec.mode === 'self') g = { result: selfResult, parts: [] };
    else g = grade(spec, ans);
    const result = spec.mode === 'self' ? 'self_' + selfResult : g.result;
    const ev = addEvent('attempt', id, { result, hints: hintN, revealed, answer: ans, parts: g.parts, near: g.near || false, mode: route.q.from || 'direct' });
    setLastAttempt(ev); setRes({ ...g, result }); setPhase('result');
    setKV(draftKey(id), { text: '', parts: [], at: new Date().toISOString(), submitted: true });
  }
  function reveal() {
    if (!revealed) addEvent('attempt', id, { result: 'revealed', hints: hintN, revealed: true, answer: ans });
    setRevealed(true);
  }
  const showAnswer = phase === 'result' || revealed;
  const hints = p.hints || [];
  const next = recommendProblem(c, cst, pst, { exclude: new Set([id]) });
  const similar = [...new Set((p.concepts || []).flatMap(cid => c.problemsByConcept[cid] || []))].filter(x => x !== id).slice(0, 6);

  return (
    <div class="page problem">
      <div class="crumbs small"><a href={'#/practice?set=' + p.set}>{p.setTitle}</a> · {p.no}번</div>
      <h1 class="h2">{p.setTitle} {p.no}번 <span class="muted small">{AREA_LABEL[p.area]}{p.lang ? ' · ' + LANG_LABEL[p.lang] : ''}</span></h1>
      <div class="meta"><OriginBadge origin={p.origin} /> <VBadges list={p.verification} />
        {st?.level ? <span class={'st st' + st.level}>{LEVEL_LABEL[st.level]} · 시도 {st.count}회</span> : null}
      </div>
      <div class="small">주제: {showTitle || showAnswer || p.area !== 'theory' ? <b>{p.title}</b> : <button class="linkbtn" onClick={() => setShowTitle(true)}>주제 보기(답이 드러날 수 있음)</button>}</div>

      {conflict && (
        <div class="alert warn" role="alert">
          다른 기기({conflict.server?.device || '알 수 없음'})에서 이 문제의 작성 중 답안이 먼저 바뀌었습니다. 어느 쪽을 남길지 고르세요.
          <div class="row"><button class="btn small" onClick={() => { resolveConflict(draftKey(id), 'server'); const v = conflict.server?.value || {}; setAns({ text: v.text || '', parts: v.parts || [] }); }}>다른 기기 답안 사용</button>
            <button class="btn small" onClick={() => resolveConflict(draftKey(id), 'mine')}>이 기기 답안 유지</button></div>
          <details><summary>다른 기기 답안 보기</summary><pre class="pre">{JSON.stringify(conflict.server?.value, null, 1)}</pre></details>
        </div>
      )}

      <InkBar api={ink} prefs={inkPrefs} setPrefs={setInkPrefs} />

      <section class="qbox">
        {p.notice && <div class="notice small"><b>원본 표기</b> {p.notice}</div>}
        {p.reconstructed && <div class="alert warn small"><b>AI 재구성 문항</b> — {p.reconstructed}</div>}
        {(!showImg || !p.image) && <Md text={p.prompt} />}
        {(!showImg || !p.image) && p.tables && p.tables.map((t, i) => <Table key={i} {...t} />)}
        {(!showImg || !p.image) && p.code && <Code code={p.code} lang={LANG_LABEL[p.lang] || ''} overlay={<InkCodeLayer api={ink} prefs={inkPrefs} />} />}
        {showImg && p.image && <SignedImg path={p.image} alt={`${p.setTitle} ${p.no}번 문제 원문`} />}
        {p.image && <button class="linkbtn small" onClick={() => setShowImg(!showImg)}>{showImg ? '텍스트로 보기' : '원문 이미지로 보기'}{p.prefer_image && !showImg ? ' (표·그림은 원문 이미지가 정확합니다)' : ''}</button>}
      </section>

      <InkPad api={ink} prefs={inkPrefs} hasCode={!!p.code && !(showImg && p.image)} />

      {phase === 'solve' && (
        <section class="answer">
          <h2 class="h3">내 답안</h2>
          <AnswerInput spec={spec} ans={ans} update={update} />
          <div class="small muted">{draft.at && !draft.submitted ? '작성 중 답안은 자동 저장됩니다.' : '입력하면 자동 저장됩니다.'} {spec.answerHint}</div>
          {hintN > 0 && <ol class="hints">{hints.slice(0, hintN).map((h, i) => <li key={i}><Md text={h} class="inline" /></li>)}</ol>}
          <div class="row wrap">
            {spec.mode !== 'self' && <button class="btn primary" onClick={() => submit()}>제출</button>}
            {spec.mode === 'self' && !revealed && <button class="btn primary" onClick={reveal}>모범 답안과 비교하기</button>}
            {hintN < hints.length && <button class="btn" onClick={() => setHintN(hintN + 1)}>힌트 {hintN + 1}/{hints.length} 보기</button>}
            {!revealed && spec.mode !== 'self' && <button class="btn ghost" onClick={reveal}>해설 바로 보기</button>}
          </div>
          {spec.mode === 'self' && revealed && (
            <div class="selfgrade">
              <h3 class="h4">모범 답안</h3><Md text={'```\n' + spec.model + '\n```'} />
              {spec.checklist && <><h3 class="h4">필수 요소 체크</h3>
                <ul class="checks">{spec.checklist.map((x, i) => <li key={i}><label><input type="checkbox" checked={!!selfChecks[i]} onChange={e => setSelfChecks({ ...selfChecks, [i]: e.target.checked })} /> {x}</label></li>)}</ul></>}
              <p class="small muted">공식 채점 기준이 없는 문제입니다. 체크리스트로 스스로 판단한 연습용 결과로 기록됩니다.</p>
              <div class="row"><button class="btn ok" onClick={() => submit('correct')}>맞힘</button><button class="btn" onClick={() => submit('partial')}>일부만</button><button class="btn bad" onClick={() => submit('wrong')}>틀림</button></div>
            </div>
          )}
        </section>
      )}

      {phase === 'result' && res && (
        <section class={'result r-' + res.result}>
          <h2 class="h3">{{ correct: '정답', partial: '부분 정답', wrong: '오답', self_correct: '맞힘(자기 채점)', self_partial: '일부만(자기 채점)', self_wrong: '틀림(자기 채점)' }[res.result]}</h2>
          {res.near && <p class="small">공백·줄바꿈 배치만 다릅니다. 출력 형식(공백·줄바꿈)도 답의 일부이니 확인하세요.</p>}
          {spec.mode === 'parts' && <ul class="parts">{spec.parts.map((pt, i) => <li key={i} class={res.parts[i] ? 'ok' : 'bad'}>{pt.label ? pt.label + ': ' : ''}<code>{ans.parts[i] || '(빈칸)'}</code> {res.parts[i] ? '✓' : '✗'}</li>)}</ul>}
          {spec.mode === 'output' && <div class="small">내 답안<pre class="pre">{ans.text || '(빈칸)'}</pre></div>}
          {(res.result !== 'correct' && res.result !== 'self_correct') && lastAttempt && <CausePicker pid={id} attempt={lastAttempt} />}
          <div class="row wrap"><button class="btn" onClick={() => { setPhase('solve'); setHintN(0); setRevealed(false); }}>다시 풀기</button>
            {next && <a class="btn primary" href={'#/p/' + next.pid}>다음 추천 문제</a>}</div>
          {next && <div class="small muted">다음 추천 이유: {next.reason}</div>}
        </section>
      )}

      {showAnswer && <Explanation p={p} spec={spec} />}

      <section>
        <h2 class="h3">관련 개념</h2>
        {(p.concepts || []).length ? <ul class="list">{p.concepts.map(cid => { const x = c.conceptById[cid]; return x ? <li key={cid}><a href={'#/c/' + cid}>{x.title}</a> {cst[cid]?.readAt ? <span class="small muted">· 읽어봄</span> : <span class="small muted">· 아직 안 봄</span>}</li> : null; })}</ul> : <p class="small muted">연결된 개념 없음</p>}
        {showAnswer && similar.length > 0 && <><h3 class="h4">같은 개념의 다른 문제(변형 연습)</h3><ul class="list">{similar.map(x => { const q = c.problemById[x]; return <li key={x}><a href={'#/p/' + x}>{q.setTitle} {q.no}번</a> <span class="small muted">{LEVEL_LABEL[pst[x]?.level || 0]}</span></li>; })}</ul></>}
      </section>

      <section>
        <h2 class="h3">출처</h2>
        <ul class="srcs">
          {(p.sources || []).filter(x => x.role === 'question').map((x, i) => <SourceRef key={i} src={x} label={'문제 원문 · ' + (c.fileById[x.file]?.title || '')} />)}
          {showAnswer ? (p.sources || []).filter(x => x.role === 'answer').map((x, i) => <SourceRef key={'a' + i} src={x} label={'정답·해설 원문 · ' + (c.fileById[x.file]?.title || '')} />)
            : <li class="small muted">정답·해설 원문 링크는 답안을 제출하거나 해설을 열면 표시됩니다.</li>}
          {(p.sources || []).filter(x => x.role === 'deeper').map((x, i) => <SourceRef key={'d' + i} src={x} label={'심화 학습 · ' + (c.fileById[x.file]?.title || '')} />)}
        </ul>
        {p.duplicates?.length ? <p class="small muted">같은 문제가 실린 다른 자료: {p.duplicates.join(', ')}</p> : null}
        <VDetails list={p.verification} />
      </section>

      {st?.attempts?.length ? (
        <details class="history"><summary>내 풀이 기록 ({st.attempts.filter(a => a.result !== 'revealed').length})</summary>
          <ul>{st.attempts.map(a => <li key={a.id} class="small">{new Date(a.at).toLocaleString('ko-KR')} · {a.result}{a.hints ? ` · 힌트 ${a.hints}` : ''}{a.revealed ? ' · 해설 먼저 봄' : ''}{st.causes[a.id] ? ' · 원인: ' + st.causes[a.id] : ''}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function AnswerInput({ spec, ans, update }) {
  if (spec.mode === 'parts') {
    return (
      <div class="partsin">
        {spec.parts.map((pt, i) => (
          <label key={i} class="partin"><span>{pt.label || '답'}</span>
            <input type="text" autoComplete="off" autoCapitalize="off" spellcheck={false} value={ans.parts[i] || ''}
              onInput={e => { const parts = [...ans.parts]; parts[i] = e.target.value; update({ ...ans, parts }); }} />
          </label>
        ))}
      </div>
    );
  }
  return (
    <textarea class="mono" rows={spec.mode === 'self' ? 6 : 4} autoComplete="off" autoCapitalize="off" spellcheck={false} aria-label="답안 입력"
      placeholder={spec.mode === 'output' ? '출력 결과를 그대로 입력 (줄바꿈·공백 포함)' : '답안 입력'}
      value={ans.text} onInput={e => update({ ...ans, text: e.target.value })} />
  );
}

function CausePicker({ pid, attempt }) {
  const [picked, setPicked] = useState(null);
  return (
    <div class="cause">
      <div class="small">틀린 원인을 직접 골라 두면 오답·복습 화면에서 모아 볼 수 있습니다. (자동으로 판단하지 않습니다)</div>
      <div class="chips">{CAUSES.map(c => <button key={c} class={'chip' + (picked === c ? ' on' : '')} aria-pressed={picked === c} onClick={() => { setPicked(c); addEvent('cause', pid, { attempt_id: attempt.id, cause: c }); }}>{c}</button>)}</div>
    </div>
  );
}

function Explanation({ p, spec }) {
  const e = p.explanation || {};
  return (
    <section class="expl">
      <h2 class="h3">정답과 해설</h2>
      <div class="ansbox">
        <div class="small muted">정답 {p.answer_source ? `(${p.answer_source})` : ''}</div>
        <pre class="pre big">{p.answer_display}</pre>
        {spec.gnote && <div class="small">채점 기준: {spec.gnote}</div>}
        {spec.mode === 'parts' && spec.parts.some(x => x.accept.length > 1) && (
          <details class="small"><summary>허용 답안 목록</summary><ul>{spec.parts.map((x, i) => <li key={i}>{x.label ? x.label + ': ' : ''}{x.accept.join(' / ')}</li>)}</ul></details>)}
        <div class="small muted">공식 채점 기준이 공개되지 않은 문제입니다. 자료 해설과 구축 단계 검토를 바탕으로 한 연습용 채점입니다.</div>
      </div>
      {e.provider && <div class="small muted">아래 해설: {e.provider}</div>}
      {e.summary && <p><b>{e.summary}</b></p>}
      {e.steps?.length ? <><h3 class="h4">풀이 과정</h3><ol>{e.steps.map((x, i) => <li key={i}><Md text={x} class="inline" /></li>)}</ol></> : null}
      {e.trace?.length ? <><h3 class="h4">실행 추적</h3><Code code={e.trace.join('\n')} numbers={false} /></> : null}
      {e.trace_table && <><h3 class="h4">변수 상태 표</h3><Table {...e.trace_table} /></>}
      {e.points?.length ? <><h3 class="h4">채점 포인트</h3><ul>{e.points.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
      {e.pitfalls?.length ? <><h3 class="h4">대표적인 오답 이유</h3><ul>{e.pitfalls.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
      {e.format?.length ? <p class="small">답안 표기: {e.format.join(' ')}</p> : null}
      {e.note && <p class="small">자료 주석: {e.note}</p>}
      {p.ai_notes?.length ? (
        <div class="ainote"><b>구축 단계 검토 메모 (AI 작성, 자료 해설과 구분)</b><ul>{p.ai_notes.map((x, i) => <li key={i}><Md text={x} class="inline" /></li>)}</ul></div>
      ) : null}
    </section>
  );
}
