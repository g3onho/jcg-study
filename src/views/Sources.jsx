import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, getState } from '../store.js';
import { Md, VBadges, Empty } from '../components/ui.jsx';

const STATUS_LABEL = { done: '분석 완료', partial: '일부 분석', none: '미분석', fail: '읽기 실패' };

export function Sources({ route }) {
  const s = useStore(); const c = s.content;
  const [tab, setTab] = useState(route.q.tab || 'files');
  const [q, setQ] = useState('');
  const files = c.files.filter(f => !q || (f.title + f.path + (f.topic || '')).toLowerCase().includes(q.toLowerCase()));
  const unverified = c.problems.filter(p => (p.verification || []).some(v => v.type === '추가 확인 필요'));
  const uconcepts = c.concepts.filter(x => (x.verification || []).some(v => v.type === '추가 확인 필요'));
  return (
    <div class="page">
      <h1>자료와 검증</h1>
      <div class="tabs" role="tablist">
        {[['files', `원본 자료 (${c.files.length})`], ['conflicts', `충돌·정정 (${c.conflicts.length})`], ['unverified', `추가 확인 필요 (${unverified.length + uconcepts.length})`], ['coverage', '출제기준 대응'], ['scope', '분석 범위']].map(([k, l]) =>
          <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'files' && (
        <>
          <input type="search" placeholder="파일명·주제 검색" aria-label="원본 자료 검색" value={q} onInput={e => setQ(e.target.value)} />
          <ul class="files">{files.map(f => (
            <li key={f.id}>
              <div><a href={'#/pdf/' + f.id}><b>{f.title}</b></a> <span class={'fs fs-' + f.analysis}>{STATUS_LABEL[f.analysis]}</span></div>
              <div class="small muted">{f.path} · {f.kind} · {f.pages}쪽{f.version ? ' · ' + f.version : ''}{f.date ? ' · 제작 ' + f.date : ''}{f.target ? ' · 대상: ' + f.target : ''}</div>
              <div class="small">{f.topic}</div>
              <div class="small">텍스트 추출: {f.text}{f.note ? ' · ' + f.note : ''}</div>
              {f.relations?.length ? <div class="small">관계: {f.relations.join(' · ')}</div> : null}
              {f.qa ? <div class="small">문제–해설 대응: {f.qa}</div> : null}
            </li>))}</ul>
        </>
      )}
      {tab === 'conflicts' && (c.conflicts.length ? <ul class="list">{c.conflicts.map(x => (
        <li key={x.id} class="conflict">
          <b>{x.topic}</b> <span class={'cs cs-' + x.status}>{x.status === 'resolved' ? '결론 채택' : '미해결'}</span>
          <ul>{x.items.map((it, i) => <li key={i} class="small"><b>{it.source}</b>: {it.claim}</li>)}</ul>
          <div class="small">판단 근거: <Md text={x.basis} class="inline" /></div>
          <div class="small">결론: <Md text={x.decision} class="inline" /></div>
          {x.links?.length ? <div class="small">관련: {x.links.map((l, i) => <a key={i} href={l.href}>{l.label} </a>)}</div> : null}
        </li>))}</ul> : <Empty>기록된 충돌이 없습니다.</Empty>)}
      {tab === 'unverified' && (
        <>
          <p class="small muted">근거가 부족해 확정 정답처럼 다루지 않는 항목입니다.</p>
          <ul class="list">{unverified.map(p => <li key={p.id}><a href={'#/p/' + p.id}>{p.setTitle} {p.no}번</a><div class="small">{p.verification.filter(v => v.type === '추가 확인 필요').map(v => v.detail).join(' / ')}</div></li>)}
            {uconcepts.map(x => <li key={x.id}><a href={'#/c/' + x.id}>개념: {x.title}</a><div class="small">{x.verification.filter(v => v.type === '추가 확인 필요').map(v => v.detail).join(' / ')}</div></li>)}</ul>
        </>
      )}
      {tab === 'coverage' && (
        <div class="tbl" tabIndex={0}><table><thead><tr><th>출제기준 주요항목</th><th>개념</th><th>문제</th><th>상태</th></tr></thead>
          <tbody>{c.coverage.map(r => <tr key={r.std}><td>{r.std}</td><td>{r.concepts}</td><td>{r.problems}</td><td>{r.note}</td></tr>)}</tbody></table>
          <p class="small muted">{c.coverageSource}</p></div>
      )}
      {tab === 'scope' && <Md text={c.scopeNote} />}
    </div>
  );
}

let pdfjsP = null;
async function pdfjs() {
  if (!pdfjsP) pdfjsP = (async () => {
    const lib = await import('pdfjs-dist/build/pdf.min.mjs');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return pdfjsP;
}

export function PdfView({ id, route }) {
  const s = useStore(); const c = s.content; const f = c.fileById[id];
  const [doc, setDoc] = useState(null); const [err, setErr] = useState(null); const [url, setUrl] = useState(null);
  const [page, setPage] = useState(Number(route.q.p) || 1); const [scale, setScale] = useState(1);
  const canvas = useRef();
  useEffect(() => { setPage(Number(route.q.p) || 1); }, [route.q.p, id]);
  useEffect(() => {
    if (!f) return; let alive = true; setDoc(null); setErr(null);
    (async () => {
      try {
        const u = await getState().api.signedUrl(f.storage, 900); if (!alive) return; setUrl(u);
        const lib = await pdfjs();
        const d = await lib.getDocument({ url: u }).promise; if (alive) setDoc(d);
      } catch (e) { if (alive) setErr(e.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    if (!doc || !canvas.current) return; let task;
    (async () => {
      const pg = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const box = canvas.current.parentElement.clientWidth || 600;
      const vp0 = pg.getViewport({ scale: 1 });
      const sc = (box / vp0.width) * scale; const dpr = window.devicePixelRatio || 1;
      const vp = pg.getViewport({ scale: sc * dpr });
      const cv = canvas.current; cv.width = vp.width; cv.height = vp.height; cv.style.width = (vp.width / dpr) + 'px';
      task = pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }); await task.promise.catch(() => {});
    })();
    return () => task?.cancel?.();
  }, [doc, page, scale]);
  if (!f) return <div class="page"><p>자료를 찾을 수 없습니다.</p></div>;
  const go = n => { const p = Math.min(Math.max(1, n), doc?.numPages || f.pages); setPage(p); history.replaceState(null, '', '#/pdf/' + id + '?p=' + p); };
  return (
    <div class="page pdfpage">
      <div class="crumbs small"><a href="#/sources">자료와 검증</a></div>
      <h1 class="h2">{f.title}</h1>
      <div class="small muted">{f.path} · PDF {f.pages}쪽 {f.printedNote ? '· ' + f.printedNote : ''}</div>
      <div class="row wrap pdfbar">
        <button class="btn small" onClick={() => go(page - 1)} disabled={page <= 1}>◀ 이전</button>
        <label class="small">PDF 쪽 <input type="number" min="1" max={doc?.numPages || f.pages} value={page} onChange={e => go(Number(e.target.value))} style="width:5em" /> / {doc?.numPages || f.pages}</label>
        <button class="btn small" onClick={() => go(page + 1)} disabled={doc && page >= doc.numPages}>다음 ▶</button>
        <button class="btn small" onClick={() => setScale(Math.max(0.5, scale - 0.25))}>－</button>
        <button class="btn small" onClick={() => setScale(Math.min(3, scale + 0.25))}>＋</button>
        {url && <a class="btn small" href={url} target="_blank" rel="noopener">원본 열기·내려받기 (15분 유효 링크)</a>}
      </div>
      {f.printedMap && f.printedMap[page - 1] != null && f.printedMap[page - 1] !== page && <div class="small">이 쪽의 인쇄된 쪽 번호: {f.printedMap[page - 1]}</div>}
      {err && <div class="alert">원본을 불러오지 못했습니다: {err}. PDF {page}쪽을 원본 파일에서 직접 찾아보세요.</div>}
      {!doc && !err && <div class="muted">불러오는 중…</div>}
      <div class="pdfwrap"><canvas ref={canvas} aria-label={`${f.title} ${page}쪽`} /></div>
    </div>
  );
}
