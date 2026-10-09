import { Marked, Renderer } from 'marked';

const escapeHtml = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderMarkdown(text, { keywords = [], memorize = false } = {}) {
  const words = [...new Set(keywords.filter(k => typeof k === 'string' && k.trim()))].sort((a, b) => b.length - a.length);
  const pattern = words.length ? new RegExp(words.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const highlight = value => pattern ? value.split(/(&#(?:\d+|x[\da-f]+);|&[a-z]+;)/gi).map((part, i) => i % 2 ? part : part.replace(pattern, (word, offset) => {
        if (/\w/.test(word[0]) && /\w/.test(part[offset - 1] || '')) return word;
        if (/\w/.test(word.at(-1)) && /\w/.test(part[offset + word.length] || '')) return word;
        return '<span class="study-keyword">' + word + '</span>';
      })).join('') : value;
  let memoryOpen = memorize;
  const renderer = new Renderer();
  // 원시 HTML은 문자로 표시하고 코드와 링크 주소는 강조 처리에서 제외한다.
  renderer.html = escapeHtml;
  renderer.text = value => {
    if (!memoryOpen) return highlight(value);
    const end = value.search(/[.!?。](?=\s|$)/);
    if (end < 0) return '<mark class="study-mark">' + highlight(value) + '</mark>';
    memoryOpen = false;
    return '<mark class="study-mark">' + highlight(value.slice(0, end + 1)) + '</mark>' + highlight(value.slice(end + 1));
  };
  for (const method of ['paragraph', 'listitem']) {
    const original = renderer[method];
    renderer[method] = function (...args) { memoryOpen = false; return original.apply(this, args); };
  }
  const marked = new Marked({ gfm: true, breaks: false, renderer });
  return marked.parse(String(text || '')).replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}
