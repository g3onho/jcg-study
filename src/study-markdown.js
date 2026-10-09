import { Marked, Renderer } from 'marked';

const escapeHtml = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function studyHighlights({ keywords = [], memoryTerms = [] } = {}) {
  const memory = new Set(memoryTerms.filter(k => typeof k === 'string' && k.trim()));
  const codeMemory = new Set([...memory].map(escapeHtml));
  const patternFor = words => words.length ? new RegExp([...words].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const pattern = patternFor([...new Set(keywords.filter(k => typeof k === 'string' && k.trim() && !memory.has(k)))]);
  const memoryPattern = patternFor([...memory]);
  const atBoundary = (part, word, offset) => !(/\w/.test(word[0]) && /\w/.test(part[offset - 1] || '')) && !(/\w/.test(word.at(-1)) && /\w/.test(part[offset + word.length] || ''));
  const yellow = part => memoryPattern ? part.replace(memoryPattern, (word, offset) => atBoundary(part, word, offset) ? '<mark class="study-mark">' + word + '</mark>' : word) : part;
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
  return { highlight, codeMemory };
}

export function renderStudyText(text, options) {
  return studyHighlights(options).highlight(escapeHtml(text));
}

export function renderMarkdown(text, options) {
  const { highlight, codeMemory } = studyHighlights(options);
  const renderer = new Renderer();
  // 원시 HTML은 문자로 표시한다. 코드 블록·링크 주소는 보존하고 선택한 인라인 답안만 강조한다.
  renderer.html = escapeHtml;
  renderer.text = highlight;
  renderer.codespan = value => '<code>' + (codeMemory.has(value) ? '<mark class="study-mark">' + value + '</mark>' : value) + '</code>';
  const marked = new Marked({ gfm: true, breaks: false, renderer });
  return marked.parse(String(text || '')).replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}
