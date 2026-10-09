import { useState } from 'preact/hooks';
import { useStore, getState, exportBackup, importBackup, resolveConflict, signOut, loadAll } from '../store.js';
import { APP_VERSION, EXAM_LABEL } from '../config.js';

export function Settings() {
  const s = useStore();
  const [msg, setMsg] = useState(null);
  const [imp, setImp] = useState(null);
  function download() {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `jcg-study-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function restore(e) {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await importBackup(JSON.parse(await f.text())); setMsg(`복원: 새 기록 ${r.events}건, 상태 ${r.kv}건 추가(기존 기록은 지우지 않음)`); }
    catch (x) { setMsg('복원 실패: ' + x.message); }
  }
  return (
    <div class="page">
      <h1>설정·백업</h1>
      <section><h2 class="h3">계정</h2>
        <p>{s.session?.user?.email} · 이 기기: {s.device} · 앱 {APP_VERSION} · 콘텐츠 {s.content?.version || '-'}</p>
        <p class="small muted">시험 기준일: {EXAM_LABEL}</p>
        <button class="btn" onClick={signOut}>로그아웃</button>
      </section>

      <section><h2 class="h3">동기화 상태</h2>
        <p class="small">서버 저장 대기: 이벤트 {s.outbox.length}건, 상태 {Object.keys(s.kvPending).length}건 · 마지막 동기화 {s.loadedAt ? new Date(s.loadedAt).toLocaleString('ko-KR') : '-'}</p>
        <button class="btn small" onClick={() => loadAll()}>지금 다시 불러오기</button>
        {Object.keys(s.conflicts).length ? (
          <div><h3 class="h4">충돌 ({Object.keys(s.conflicts).length})</h3>
            <ul class="list">{Object.entries(s.conflicts).map(([k, v]) => <li key={k}><code>{k}</code> — 다른 기기({v.server?.device}) 값과 충돌
              <div class="row"><button class="btn small" onClick={() => resolveConflict(k, 'server')}>다른 기기 값 사용</button><button class="btn small" onClick={() => resolveConflict(k, 'mine')}>이 기기 값 유지</button></div></li>)}</ul></div>) : null}
      </section>

      <section><h2 class="h3">학습 기록 백업·복원</h2>
        <p class="small">풀이·오답·복습·개념 확인 기록과 작성 중 답안을 JSON 파일로 내려받습니다. 복원은 기존 기록을 지우지 않고 없는 기록만 추가합니다(같은 기록은 ID로 중복 제거).</p>
        <div class="row wrap"><button class="btn" onClick={download}>백업 파일 내려받기</button>
          <label class="btn">백업 파일로 복원<input type="file" accept="application/json" onChange={restore} hidden /></label></div>
        {msg && <p class="small">{msg}</p>}
      </section>

      <section id="rules"><h2 class="h3">추천·복습 규칙</h2>
        <ul class="small">
          <li>복습 간격: 틀림·부분 정답 → 1일, 힌트 사용·해설 먼저 봄 → 2일, 처음 맞힘 → 4일, 다른 날 다시 맞힘 → 8일, 다시 맞힘 3회 이상 → 16일. 시험 이틀 전까지는 한 번 더 보도록 간격을 줄입니다.</li>
          <li>밀린 숙제를 쌓지 않습니다. 볼 때가 된 문제 중 오답·누적 오답·힌트 사용 순으로 상위 몇 개만 보여 줍니다.</li>
          <li>개념 추천: 시험 7일 이내면 아직 안 본 핵심 개념 → 최근 2주 연결 문제 오답 3회 이상인 개념 → 선수 개념을 마친 미확인 개념(목차 순) 순입니다.</li>
          <li>문제 추천: 복습 차례 문제 → 방금/최근 본 개념과 연결된 새 문제 → 가장 적게 풀어 본 영역의 새 문제.</li>
          <li>‘핵심’ 표시는 2022년 3회~2026년 2회 복원 기출 12회분(171문항)에서 연결된 문항이 있는 개념입니다. 다음 시험 출제 확률을 뜻하지 않습니다.</li>
          <li>한 번 맞혔다고 숙달로 보지 않습니다. ‘나중에 다시 맞힘’은 처음 시도와 다른 날에 다시 맞혔을 때만 표시합니다.</li>
        </ul>
      </section>

      <section><h2 class="h3">콘텐츠 가져오기(관리)</h2>
        <p class="small">구축 단계에서 만든 콘텐츠 패키지 폴더(<code>_웹앱_업로드</code>)를 선택하면 비공개 저장소로 올립니다. 로그인한 허용 계정만 가능합니다.</p>
        <label class="btn">패키지 폴더 선택<input type="file" webkitdirectory="" directory="" multiple hidden onChange={e => setImp([...e.target.files])} /></label>
        {imp && <Importer files={imp} />}
      </section>
    </div>
  );
}

function Importer({ files }) {
  const [log, setLog] = useState([]); const [busy, setBusy] = useState(false); const [done, setDone] = useState(0);
  const rel = f => (f.webkitRelativePath || f.name).split('/').slice(1).join('/');
  const items = files.filter(f => /^(content|crops|originals)\//.test(rel(f)));
  async function run() {
    setBusy(true); const api = getState().api; let n = 0; const out = [];
    // 콘텐츠 번들은 마지막에 올려, 이미지·원본이 먼저 준비되게 한다
    const order = [...items.filter(f => !rel(f).startsWith('content/')), ...items.filter(f => rel(f).startsWith('content/'))];
    for (const f of order) {
      const p = rel(f);
      const type = p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : p.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
      for (let t = 0; t < 3; t++) {
        try { await api.uploadFile(p, f, type); n++; setDone(n); break; }
        catch (e) { if (t === 2) out.push(p + ': ' + e.message); }
      }
    }
    setLog(out); setBusy(false);
    if (!out.length) loadAll();
  }
  const size = items.reduce((a, f) => a + f.size, 0);
  return (
    <div class="card">
      <p class="small">대상 {items.length}개 · {(size / 1048576).toFixed(1)}MB (content/, crops/, originals/ 폴더만)</p>
      <button class="btn primary" disabled={busy || !items.length} onClick={run}>{busy ? `올리는 중… ${done}/${items.length}` : '비공개 저장소로 올리기'}</button>
      {!busy && done > 0 && <p class="small">완료 {done}/{items.length}{log.length ? `, 실패 ${log.length}` : ''}</p>}
      {log.length ? <ul class="small">{log.map(l => <li key={l}>{l}</li>)}</ul> : null}
    </div>
  );
}
