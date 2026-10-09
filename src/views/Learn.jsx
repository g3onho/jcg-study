import { useEffect, useState } from 'preact/hooks';
import { useStore, addEvent, setKV } from '../store.js';
import { problemStates, conceptStates, LEVEL_LABEL, AREA_LABEL } from '../engine.js';
import { grade } from '../grading.js';
import { Md, Code, Table, VBadges, VDetails, SourceRef, Empty } from '../components/ui.jsx';
import { problemLink } from '../study-links.js';
import { getStudyPriority, PRIORITY_LABEL } from '../study-priority.js';

export function Learn({ route }) {
  const s = useStore(); const c = s.content;
  const cst = conceptStates(s.events); const pst = problemStates(s.events);
  const [area, setArea] = useState(route.q.area || '');
  const [priority, setPriority] = useState('');
  const units = c.toc.filter(u => !area || u.area === area).map(u => ({ ...u, concepts: u.concepts.filter(id => c.conceptById[id] && (!priority || getStudyPriority(c.conceptById[id]) === priority)) })).filter(u => u.concepts.length);
  return (
    <div class="page">
      <h1>통합 개념 학습</h1>
      <p class="small muted">학습 자료의 중요도를 참고해 먼저 볼 개념을 고르세요. 기초부터 목차 순서대로 공부해도 좋습니다.</p>
      <details class="exam-guide small"><summary>중요도 표시 안내</summary><p>💯 · ⭐핵심 · 🔥보조 · 🤔후순위는 학습 자료 제작자의 추천 우선순위이며 출제 확률이 아닙니다. '포함'은 서로 다른 등급이 섞였거나 일부 항목만 중요도를 확인한 개념입니다. 예를 들어 응집도·결합도(⭐)와 SOLID(🔥)가 묶인 모듈 설계는 '⭐ 핵심 포함'으로 표시합니다. 상세에서 항목별 등급을 확인하세요. 중요도 미지정은 중요하지 않다는 뜻이 아닙니다.</p></details>
      <div class="filters"><select aria-label="영역" value={area} onChange={e => setArea(e.target.value)}><option value="">전체 영역</option>{Object.entries(AREA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="자료 중요도" value={priority} onChange={e => setPriority(e.target.value)}><option value="">모든 중요도</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {!units.length && <Empty>해당 조건의 개념이 없습니다. 영역이나 중요도를 바꿔보세요.</Empty>}
      {units.map(u => (
        <section key={u.id} class="unit">
          <h2 class="h3">{u.title} <span class="small muted">{u.std ? '· 출제기준: ' + u.std : ''}</span></h2>
          <ul class="clist concept-list">{u.concepts.map(cid => {
            const x = c.conceptById[cid]; if (!x) return null;
            const cs = cst[cid]; const n = (c.problemsByConcept[cid] || []).length;
            const solved = (c.problemsByConcept[cid] || []).filter(pid => pst[pid]?.level >= 2).length;
            const checksOk = x.checks?.length && x.checks.every(q => cs?.checks?.[q.id]?.result === 'correct');
            return (
              <li key={cid}><a href={'#/c/' + cid}>
                <span class="concept-row-title">{x.title}<span class="small muted">{cs?.readAt ? (checksOk ? '확인 문제 통과' : '읽어봄') : '미확인'} · 연결 문제 {solved}/{n}</span></span>
                {getStudyPriority(x) !== 'unrated' && <PrioritySummary concept={x} />}
              </a></li>);
          })}</ul>
        </section>
      ))}
      {c.coverageNote && <p class="small muted">{c.coverageNote}</p>}
    </div>
  );
}

export function Concept({ id }) {
  const s = useStore(); const c = s.content;
  const x = c.conceptById[id];
  const cst = conceptStates(s.events); const pst = problemStates(s.events);
  const cs = cst[id];
  const mastered = cs?.readAt && x?.checks?.length && x.checks.every(q => cs.checks?.[q.id]?.result === 'correct');
  const [brief, setBrief] = useState(!!mastered);
  useEffect(() => {
    setBrief(!!mastered);
    if (x) setKV('pos', { hash: '/c/' + id, title: '개념: ' + x.title, at: new Date().toISOString(), device: s.device }, 1500);
  }, [id]);
  if (!x) return <div class="page"><p>개념을 찾을 수 없습니다.</p></div>;
  const unit = c.toc.find(u => u.concepts.includes(id));
  const idx = unit ? unit.concepts.indexOf(id) : -1;
  const allIds = c.toc.flatMap(u => u.concepts);
  const gi = allIds.indexOf(id);
  const prev = allIds[gi - 1], next = allIds[gi + 1];
  const probs = c.problemsByConcept[id] || [];
  const basis = (x.sources || []).filter(z => z.role === 'basis');
  const deeper = (x.sources || []).filter(z => z.role !== 'basis');
  const studyText = { keywords: x.studyKeywords || x.keywords, memoryTerms: x.memoryTerms };
  return (
    <div class="page concept">
      <div class="crumbs small"><a href="#/learn">개념 학습</a> · {unit?.title}</div>
      <h1>{x.title}</h1>
      <div class="concept-overview"><PrioritySummary concept={x} />
        {!!x.studyPriority?.topics?.length && <details class="exam-history small"><summary>세부 항목 중요도</summary><ul>{x.studyPriority.topics.map((t, i) => <li key={i}><b class={'priority-' + t.level}>{PRIORITY_LABEL[t.level] || PRIORITY_LABEL.unrated}</b> · {t.title}</li>)}</ul><p class="muted">학습 자료의 추천 우선순위이며 출제 확률이 아닙니다. 표시가 없는 세부 항목은 중요도를 임의로 지정하지 않았습니다.</p>{s.isAdmin && x.studyPriority.source && <ul class="srcs"><SourceRef src={{ file: x.studyPriority.source.file, pdf_page: x.studyPriority.source.legend_page, note: '학습 우선순위 범례 · ' + x.studyPriority.source.version }} /></ul>}</details>}
      </div>
      <div class="meta"><VBadges list={x.verification} /></div>
      <p class="small muted">{x.origin_note || '여러 자료를 바탕으로 구축 단계에서 정리한 설명(AI 작성·검토)'}</p>
      {x.prereq?.length ? <p class="small">먼저 보면 좋은 개념: {x.prereq.map((p, i) => <span key={p}>{i ? ', ' : ''}<a href={'#/c/' + p}>{c.conceptById[p]?.title}</a></span>)}</p> : null}
      {mastered && <div class="notice small">이미 확인한 개념입니다. 핵심만 표시합니다. <button class="linkbtn" onClick={() => setBrief(!brief)}>{brief ? '기본 설명 펼치기' : '핵심만 보기'}</button></div>}
      {!mastered && <div class="small"><button class="linkbtn" onClick={() => setBrief(!brief)}>{brief ? '기본 설명 펼치기' : '이미 아는 내용이면 핵심만 보기'}</button></div>}

      <div class="study-legend small"><span><mark class="study-mark">형광펜: 외워야 할 용어·분류</mark></span><span class="study-keyword">빨간 글씨: 뜻을 설명하는 핵심 특징</span></div>
      {x.summary && <Md text={x.summary} class="lead" {...studyText} />}
      {x.definition && <section class="concept-definition"><h2 class="h3">암기할 핵심 정의</h2><Md text={x.definition} {...studyText} /></section>}
      {!brief && x.easy && <section><h2 class="h3">쉬운 설명</h2><Md text={x.easy} {...studyText} /></section>}
      {!brief && x.examples?.map((e, i) => (
        <section key={i} class="example"><h2 class="h3">예제{x.examples.length > 1 ? ' ' + (i + 1) : ''}: {e.title}</h2>
          {e.code && <Code code={e.code} lang={e.lang} />}
          {e.output != null && <div class="small">실행 결과{e.env ? ` (${e.env})` : ''}<pre class="pre">{e.output}</pre></div>}
          {e.trace && <Table {...e.trace} />}
          {e.explain && <Md text={e.explain} {...studyText} />}
          {e.verified && <div class="small muted">✔ {e.verified}</div>}
        </section>
      ))}
      {x.compare && <section><h2 class="h3">헷갈리는 개념 비교</h2><Md text={x.compare} {...studyText} /></section>}
      {x.pitfalls?.length ? <section><h2 class="h3">자주 틀리는 지점</h2><ul>{x.pitfalls.map((t, i) => <li key={i}><Md text={t} class="inline" {...studyText} /></li>)}</ul></section> : null}
      {x.keywords?.length ? <section><h2 class="h3">답안 핵심 키워드</h2><div class="kw concept-keywords">{x.keywords.map(k => <Md key={k} text={k} literal class="inline" {...studyText} />)}</div></section> : null}
      {!brief && x.mnemonic && <section class="small"><h2 class="h4">암기 보조(이해를 돕는 보조 수단)</h2><Md text={x.mnemonic} {...studyText} /></section>}

      {x.recall?.length ? <section><h2 class="h3">떠올려 쓰기</h2><p class="small muted">보지 않고 먼저 써 본 뒤 모범 답과 비교하세요.</p>{x.recall.map((r, i) => <Recall key={id + i} cid={id} i={i} r={r} />)}</section> : null}
      {x.checks?.length ? <section><h2 class="h3">확인 문제</h2>{x.checks.map(q => <Check key={q.id} cid={id} q={q} prev={cs?.checks?.[q.id]} />)}</section> : null}

      <div class="row wrap">
        <button class="btn" onClick={() => addEvent('concept_read', id, { brief })}>{cs?.readAt ? '다시 읽음 표시' : '이 개념 확인함(읽어봄)'}</button>
        {probs.length ? <a class="btn primary" href={problemLink(probs.find(pid => !pst[pid]?.level) || probs[0], id)}>연결 문제 풀기</a> : null}
      </div>

      {probs.length ? <section><h2 class="h3">연결 문제 ({probs.length})</h2><ul class="list">{probs.map(pid => { const p = c.problemById[pid]; return <li key={pid}><a href={problemLink(pid, id)}>{p.setTitle} {p.no}번</a> <span class="small muted">{LEVEL_LABEL[pst[pid]?.level || 0]}{pst[pid]?.status === 'wrong' ? ' · 마지막 오답' : ''}</span></li>; })}</ul></section> : null}
      {x.related?.length ? <p class="small">관련 개념: {x.related.map((r, i) => <span key={r}>{i ? ', ' : ''}<a href={'#/c/' + r}>{c.conceptById[r]?.title}</a></span>)}</p> : null}

      {s.isAdmin && <section>
        <h2 class="h3">출처와 심화 학습</h2>
        {basis.length ? <><div class="small">설명의 근거 자료</div><ul class="srcs">{basis.map((z, i) => <SourceRef key={i} src={z} />)}</ul></> : null}
        {deeper.length ? <><div class="small">더 공부할 원본(생략된 예제·문맥)</div><ul class="srcs">{deeper.map((z, i) => <SourceRef key={i} src={z} />)}</ul></> : null}
        {x.external?.length ? <><div class="small">외부 근거(공식 문서 등) — 자료 밖에서 보충</div><ul class="srcs">{x.external.map((z, i) => <li key={i}><a href={z.url} target="_blank" rel="noopener">{z.title}</a> <span class="small muted">{z.note}</span></li>)}</ul></> : null}
        <VDetails list={x.verification} />
      </section>}
      <nav class="row between small">{prev ? <a href={'#/c/' + prev}>← {c.conceptById[prev]?.title}</a> : <span />}{next ? <a href={'#/c/' + next}>{c.conceptById[next]?.title} →</a> : <span />}</nav>
    </div>
  );
}

function PrioritySummary({ concept }) {
  const level = getStudyPriority(concept);
  const mixed = concept.studyPriority?.partial || new Set((concept.studyPriority?.topics || []).map(t => t.level)).size > 1;
  return <span class="concept-priority"><b class={'priority-' + level}>{PRIORITY_LABEL[level]}{mixed ? ' 포함' : ''}</b></span>;
}

function Recall({ cid, i, r }) {
  const [v, setV] = useState(''); const [open, setOpen] = useState(false); const [mark, setMark] = useState(null);
  return (
    <div class="recall">
      <div><b>Q.</b> <Md text={r.q} class="inline" /></div>
      <textarea rows={2} value={v} onInput={e => setV(e.target.value)} aria-label="떠올린 답 입력" />
      {!open ? <button class="btn small" onClick={() => setOpen(true)}>모범 답 보기</button> : (
        <div class="model"><Md text={r.a} />
          <div class="row small">내 답은? {['기억함', '애매함', '못 떠올림'].map(m => <button key={m} class={'chip' + (mark === m ? ' on' : '')} aria-pressed={mark === m} onClick={() => { setMark(m); addEvent('recall', cid, { i, mark: m, text: v }); }}>{m}</button>)}</div>
        </div>)}
    </div>
  );
}

function Check({ cid, q, prev }) {
  const [ans, setAns] = useState({ text: '', parts: [] }); const [res, setRes] = useState(null);
  const spec = q.grading;
  function submit() {
    const g = grade(spec, ans); setRes(g);
    addEvent('concept_check', cid, { qid: q.id, result: g.result, answer: ans });
  }
  return (
    <div class="check">
      <Md text={q.q} />
      {q.code && <Code code={q.code} lang={q.lang} />}
      {spec.mode === 'parts' ? spec.parts.map((pt, i) => <label key={i} class="partin"><span>{pt.label || '답'}</span><input type="text" autoComplete="off" autoCapitalize="off" spellcheck={false} value={ans.parts[i] || ''} onInput={e => { const parts = [...ans.parts]; parts[i] = e.target.value; setAns({ ...ans, parts }); }} /></label>)
        : <textarea class="mono" rows={2} value={ans.text} onInput={e => setAns({ ...ans, text: e.target.value })} aria-label="답 입력" />}
      <div class="row"><button class="btn small primary" onClick={submit}>확인</button>{prev && !res && <span class="small muted">이전 결과: {prev.result === 'correct' ? '정답' : '오답'}</span>}</div>
      {res && (
        <div class={'cres r-' + res.result}>
          <b>{res.result === 'correct' ? '정답' : res.result === 'partial' ? '부분 정답' : '오답'}</b> — 정답: <code>{q.answer_display}</code>
          {q.explain && <Md text={q.explain} />}
        </div>
      )}
    </div>
  );
}
