import { Marked, Renderer } from 'marked';

const escapeHtml = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function studyHighlights({ keywords = [], memoryTerms = [], memoryMode = 'all' } = {}) {
  const state = { used: false, seen: new Set() }; // lead 모드: 항목(문단·목록) 하나에 하나, 같은 용어는 개념 안에서 처음 나온 곳에만
  const memory = new Set(memoryTerms.filter(k => typeof k === 'string' && k.trim()));
  const codeMemory = new Set([...memory].map(escapeHtml));
  const patternFor = words => words.length ? new RegExp([...words].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const pattern = patternFor([...new Set(keywords.filter(k => typeof k === 'string' && k.trim() && !memory.has(k)))]);
  const memoryPattern = patternFor([...memory]);
  const atBoundary = (part, word, offset) => !(/\w/.test(word[0]) && /\w/.test(part[offset - 1] || '')) && !(/\w/.test(word.at(-1)) && /\w/.test(part[offset + word.length] || ''));
  const yellow = part => memoryPattern ? part.replace(memoryPattern, (word, offset) => {
    if (!atBoundary(part, word, offset)) return word;
    if (memoryMode === 'lead') { if (state.used || state.seen.has(word)) return word; state.used = true; state.seen.add(word); }
    return '<mark class="study-mark">' + word + '</mark>';
  }) : part;
  const highlight = value => value.split(/(&#(?:\d+|x[\da-f]+);|&[a-z]+;)/gi).map((part, i) => {
    if (i % 2) return part;
    if (!pattern) return yellow(part);
    let from = 0, out = '';
    for (const match of part.matchAll(pattern)) {
      if (!atBoundary(part, match[0], match.index)) continue;
      out += yellow(part.slice(from, match.index)) + '<span class="study-keyword">' + match[0] + '</span>';
      from = match.index + match[0].length;
    }
    return out + yellow(part.slice(from));
  }).join('');
  return { highlight, codeMemory, state, memoryMode };
}

export function renderStudyText(text, options) {
  return studyHighlights(options).highlight(escapeHtml(text));
}

export function renderMarkdown(text, options) {
  const { highlight, codeMemory, state, memoryMode } = studyHighlights(options);
  const renderer = new Renderer();
  if (memoryMode === 'lead') {
    for (const name of ['paragraph', 'listitem']) {
      const base = Renderer.prototype[name];
      renderer[name] = function (...args) { const out = base.apply(this, args); state.used = false; return out; };
    }
  }
  // 원시 HTML은 문자로 표시한다. 코드 블록·링크 주소는 보존하고 선택한 인라인 답안만 강조한다.
  renderer.html = escapeHtml;
  renderer.text = highlight;
  renderer.codespan = value => {
    const mark = codeMemory.has(value) && !(memoryMode === 'lead' && (state.used || state.seen.has(value)));
    if (mark && memoryMode === 'lead') { state.used = true; state.seen.add(value); }
    return '<code>' + (mark ? '<mark class="study-mark">' + value + '</mark>' : value) + '</code>';
  };
  const marked = new Marked({ gfm: true, breaks: false, renderer });
  let html = marked.parse(String(text || ''));
  // lead 모드에서는 표 안의 용어에는 형광펜을 쓰지 않는다(표는 감자 원문 이미지로 확인).
  if (memoryMode === 'lead') html = html.replace(/<table>[\s\S]*?<\/table>/g, t => t.replace(/<mark class="study-mark">([\s\S]*?)<\/mark>/g, '$1'));
  // 한글 조사가 바로 붙어 marked가 굵게 처리하지 못한 **강조**를 코드 밖에서만 굵게 바꾼다.
  html = html.split(/(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/).map((seg, i) => i % 2 ? seg : seg.replace(/\*\*([^*<>\n]+?)\*\*/g, '<strong>$1</strong>')).join('');
  return html.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}
