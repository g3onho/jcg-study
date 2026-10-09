import { useEffect, useMemo, useState } from 'preact/hooks';
import { marked } from 'marked';
import { useStore, getState } from '../store.js';

marked.setOptions({ gfm: true, breaks: false });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 원시 HTML은 허용하지 않는다: 마크다운 안의 HTML 토큰은 글자 그대로 보이게 이스케이프한다.
marked.use({ renderer: { html(html) { return esc(typeof html === 'string' ? html : html?.text); } } });

export function Md({ text, class: cls }) {
  const html = useMemo(() => {
    // 콘텐츠는 구축 단계에서 작성·검토한 것이지만 원시 HTML은 허용하지 않는다(위 renderer.html 참고).
    let h = marked.parse(String(text || ''));
    h = h.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
    return h;
  }, [text]);
  return <div class={'md ' + (cls || '')} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Code({ code, lang, numbers = true, overlay = null }) {
  if (!code) return null;
  const lines = code.replace(/\t/g, '    ').split('\n');
  return (
    <div class="code" role="region" aria-label={(lang || '코드') + ' 코드'} tabIndex={0}>
      {lang && <div class="code-lang">{lang}</div>}
      <pre>{lines.map((l, i) => <div class="cl" key={i}>{numbers && <span class="ln" aria-hidden="true">{i + 1}</span>}<span>{l || ' '}</span></div>)}</pre>
      {overlay}
    </div>
  );
}

export function Table({ head, rows, caption }) {
  return (
    <div class="tbl" tabIndex={0}>
      <table>
        {caption && <caption>{caption}</caption>}
        {head && <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>}
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const VCLASS = { '원문 확인': 'v-src', '자료 간 일치': 'v-agree', '공식 근거 확인': 'v-official', '실행 확인': 'v-run', '추가 확인 필요': 'v-check' };
export function VBadges({ list }) {
  if (!list || !list.length) return <span class="vb v-none">검증 표시 없음</span>;
  const seen = new Set();
  return <span class="vbs">{list.filter(v => !seen.has(v.type) && seen.add(v.type)).map(v => <span key={v.type} class={'vb ' + (VCLASS[v.type] || '')} title={v.detail || ''}>{v.type}</span>)}</span>;
}
export function VDetails({ list }) {
  const s = useStore();
  if (!s.isAdmin) return null;
  if (!list || !list.length) return null;
  return (
    <details class="vdetails"><summary>검증 기록 ({list.length})</summary>
      <ul>{list.map((v, i) => <li key={i}><span class={'vb ' + (VCLASS[v.type] || '')}>{v.type}</span> <Md text={v.detail} class="inline" /></li>)}</ul>
    </details>
  );
}

export const ORIGIN_LABEL = {
  restored: '복원 기출 · 주말코딩', mock: '모의고사 · 주말코딩', variant: '기출 변형 · 주말코딩', material: '자료 예제 · 주말코딩',
  authored: '구축 중 작성(AI) · 검토 후 수록', reconstructed: 'AI 재구성(원본 일부 누락)', gamja: '감자 요약 자료',
};
export function OriginBadge({ origin }) {
  const s = useStore();
  const generic = { restored: '복원 기출', mock: '모의고사', variant: '변형 문제', material: '연습 문제', authored: 'AI 작성 연습 문제', reconstructed: 'AI 재구성 문제', gamja: '연습 문제' };
  return <span class={'ob ob-' + origin}>{(s.isAdmin ? ORIGIN_LABEL : generic)[origin] || '연습 문제'}</span>;
}

export function SourceRef({ src, label }) {
  const s = useStore();
  if (!s.isAdmin) return null;
  const f = s.content?.fileById?.[src.file];
  if (!f) return null;
  const pg = src.pdf_page;
  const printed = src.printed != null && src.printed !== pg ? ` (인쇄 ${src.printed}쪽)` : '';
  const href = `#/pdf/${src.file}${pg ? '?p=' + pg : ''}`;
  return (
    <li class="srcref">
      <a href={href}>{label || f.title}</a>
      <span class="muted"> · {f.path}{pg ? ` · PDF ${pg}쪽${printed}` : ''}</span>
      {src.note && <div class="muted small">{src.note}</div>}
    </li>
  );
}

export function SaveStatus() {
  const s = useStore();
  const pending = s.outbox.length + Object.keys(s.kvPending).length;
  const nconf = Object.keys(s.conflicts).length;
  let cls = 'ss', text;
  if (s.save.status === 'error') { cls += ' ss-err'; text = s.save.error || '연결 오류'; }
  else if (s.save.status === 'saving' || pending) { cls += ' ss-saving'; text = `저장 중… (${pending})`; }
  else if (s.save.status === 'saved') { cls += ' ss-ok'; text = '저장됨'; }
  else text = '변경 없음';
  return (
    <span class={cls} role="status" aria-live="polite">
      <span class="dot" aria-hidden="true" />{text}{nconf ? <a href="#/settings" class="ss-conf"> · 충돌 {nconf}건</a> : null}
    </span>
  );
}

export function SignedImg({ path, alt, zoom = true }) {
  const s = useStore();
  const [url, setUrl] = useState(null); const [err, setErr] = useState(null); const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true; setUrl(null); setErr(null);
    imgUrl(path).then(u => alive && setUrl(u)).catch(e => alive && setErr(e.message || String(e)));
    return () => { alive = false; };
  }, [path]);
  if (err) return <div class="alert">원문 이미지를 불러오지 못했습니다: {err}</div>;
  if (!url) return <div class="muted small">원문 이미지 불러오는 중…</div>;
  return (
    <>
      <button class="imgbtn" onClick={() => zoom && setOpen(true)} aria-label={(alt || '원문 이미지') + ' 크게 보기'}>
        <img src={url} alt={alt || '원문 이미지'} loading="lazy" />
      </button>
      {open && (
        <div class="lightbox" role="dialog" aria-modal="true" aria-label="원문 이미지 확대" onClick={() => setOpen(false)}>
          <div class="lb-inner" onClick={e => e.stopPropagation()}>
            <button class="btn lb-close" onClick={() => setOpen(false)}>닫기 ✕</button>
            <img src={url} alt={alt} />
          </div>
        </div>
      )}
    </>
  );
}

const urlCache = new Map();
export async function imgUrl(path) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const url = await getState().api.signedUrl(path, 3600);
  urlCache.set(path, { url, exp: Date.now() + 3300 * 1000 });
  return url;
}

export function Empty({ children }) { return <div class="empty">{children}</div>; }
