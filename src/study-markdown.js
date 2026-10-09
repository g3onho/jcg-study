import { Marked, Renderer } from 'marked';

const escapeHtml = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function studyHighlights({ keywords = [], memoryTerms = [], memoryMode = 'all', keywordOnce = false } = {}) {
  const state = { seen: new Set(), kw: new Set() }; // lead 모드: 같은 용어는 개념 안에서 처음 나온 곳에만
  const memory = new Set(memoryTerms.filter(k => typeof k === 'string' && k.trim()));
  const codeMemory = new Set([...memory].map(escapeHtml));
  const patternFor = words => words.length ? new RegExp([...words].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const pattern = patternFor([...new Set(keywords.filter(k => typeof k === 'string' && k.trim() && !memory.has(k)))]);
  const memoryPattern = patternFor([...memory]);
  const atBoundary = (part, word, offset) => !(/\w/.test(word[0]) && /\w/.test(part[offset - 1] || '')) && !(/\w/.test(word.at(-1)) && /\w/.test(part[offset + word.length] || ''));
  // 형광펜(적어낼 답)이 우선이다. 같은 글자 위에 빨간 글씨(답을 찾는 단서)가 겹치면 빨간 글씨는 쓰지 않는다.
  const highlight = value => value.split(/(&#(?:\d+|x[\da-f]+);|&[a-z]+;)/gi).map((part, i) => {
    if (i % 2) return part;
    const hits = [];
    if (memoryPattern) for (const m of part.matchAll(memoryPattern)) if (atBoundary(part, m[0], m.index)) hits.push({ at: m.index, end: m.index + m[0].length, word: m[0], kind: 'mem' });
    if (pattern) for (const m of part.matchAll(pattern)) {
      const at = m.index, end = at + m[0].length;
      if (!atBoundary(part, m[0], at)) continue;
      const over = hits.filter(h => h.kind === 'mem' && h.at < end && at < h.end);
      if (over.some(h => h.end - h.at >= m[0].length)) continue; // 용어 안에 들어가는 짧은 단서는 쓰지 않는다
      for (const h of over) hits.splice(hits.indexOf(h), 1);   // 더 긴 단서가 용어를 품으면 단서를 우선한다
      hits.push({ at, end, word: m[0], kind: 'kw' });
    }
    hits.sort((x, y) => x.at - y.at);
    let from = 0, out = '';
    for (const h of hits) {
      if (h.at < from) continue;
      let wrap = null;
      if (h.kind === 'mem') {
        if (!(memoryMode === 'lead' && state.seen.has(h.word))) { state.seen.add(h.word); wrap = 'mark'; }
      } else if (!(keywordOnce && state.kw.has(h.word))) { state.kw.add(h.word); wrap = 'kw'; }
      out += part.slice(from, h.at) + (wrap === 'mark' ? '<mark class="study-mark">' + h.word + '</mark>' : wrap === 'kw' ? '<span class="study-keyword">' + h.word + '</span>' : h.word);
      from = h.end;
    }
    return out + part.slice(from);
  }).join('');
  return { highlight, codeMemory, state, memoryMode };
}

export function renderStudyText(text, options) {
  return studyHighlights(options).highlight(escapeHtml(text));
}

export function renderMarkdown(text, options) {
  const { highlight, codeMemory, state, memoryMode } = studyHighlights(options);
  const renderer = new Renderer();
  // 원시 HTML은 문자로 표시한다. 코드 블록·링크 주소는 보존하고 선택한 인라인 답안만 강조한다.
  renderer.html = escapeHtml;
  renderer.text = highlight;
  renderer.codespan = value => {
    const mark = codeMemory.has(value) && !(memoryMode === 'lead' && state.seen.has(value));
    if (mark && memoryMode === 'lead') state.seen.add(value);
    return '<code>' + (mark ? '<mark class="study-mark">' + value + '</mark>' : value) + '</code>';
  };
  const marked = new Marked({ gfm: true, breaks: false, renderer });
  let html = marked.parse(String(text || ''));
  // lead 모드에서는 표 안의 용어에는 형광펜을 쓰지 않는다(표는 감자 원문 이미지로 확인).
  if (memoryMode === 'lead') html = html.replace(/<table>[\s\S]*?<\/table>/g, t => t.replace(/<mark class="study-mark">([\s\S]*?)<\/mark>/g, '$1'));
  // 한글 조사가 바로 붙어 marked가 굵게 처리하지 못한 **강조**를 코드 밖에서만 굵게 바꾼다.
  html = html.split(/(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/).map((seg, i) => i % 2 ? seg : seg.replace(/\*\*(?=\S)((?:<\/?(?:mark|span)[^>]*>|[^*<>\n])+?)(?<=\S)\*\*/g, '<strong>$1</strong>')).join('');
  html = html.replace(/\uE000/g, '<span class="ex-mark" role="img" aria-label="기출 표시">❗</span>');
  return html.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}

// 감자에서 ❗가 붙은 항목(examTerms)을 본문에서 '그 항목을 설명하는 자리'(목록 항목·표 칸·굵은 글씨의 맨 앞)에 찾아 표시 기호를 심는다.
// 못 찾은 항목은 unmatched로 돌려주어 화면 위쪽에 따로 보여 준다. 코드 블록 안은 건드리지 않는다.
const EX = '';
const escRe = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIAS = { 동등: '(?:동등|동치)', 경곗값: '(?:경곗값|경계값)' };
// 용어 철자는 자료마다 조금 다르므로(동등/동치, 공백·붙임표) 글자 사이의 공백과 붙임표는 있든 없든 같은 용어로 본다.
function termPattern(v) {
  return v.replace(/[\s-]+/g, '').split(/(동등|경곗값)/).filter(Boolean).map(p => ALIAS[p] || [...p].map(escRe).join('[\\s-]*')).join('[\\s-]*');
}
export function examVariants(term) {
  const parts = String(term).replace(/[🔎🥔]/g, '').split(/[()=,/·]/).map(v => v.replace(/^\d+\)\s*/, '').trim()).filter(v => v.length >= 2 && /[가-힣A-Za-z]/.test(v));
  return [...new Set([String(term).replace(/^\(\d+\)\s*/, '').trim(), ...parts])].filter(v => v.length >= 2).sort((a, b) => b.length - a.length);
}
export function placeExamMarks(texts, terms = []) {
  const out = { ...texts }; const unmatched = [];
  const lead = '(^|\\|)\\s*(?:>\\s*)?(?:[-*+]\\s+|\\d+\\.\\s+)?(?:\\*\\*)?';
  for (const term of terms) {
    let done = false;
    for (const stage of ['lead', 'any']) {
      for (const key of Object.keys(out)) {
        if (done || typeof out[key] !== 'string') continue;
        const lines = out[key].split('\n'); let fence = false;
        for (let i = 0; i < lines.length && !done; i++) {
          if (/^\s*```/.test(lines[i])) { fence = !fence; continue; }
          if (fence) continue;
          for (const v of examVariants(term)) {
            if (stage === 'any' && v.length < 3) continue;
            const m = new RegExp((stage === 'lead' ? lead : '()') + '(' + termPattern(v) + ')', 'i').exec(lines[i]);
            if (!m) continue;
            let at = m.index + m[0].length;
            if (lines[i][at] === '(') { const close = lines[i].indexOf(')', at); if (close > 0 && close - at < 40) at = close + 1; }
            lines[i] = lines[i].slice(0, at) + EX + lines[i].slice(at);
            done = true; break;
          }
        }
        out[key] = lines.join('\n');
      }
      if (done) break;
    }
    if (!done) unmatched.push(term);
  }
  return { texts: out, unmatched };
}
