import { Marked } from 'marked';

const escapeHtml = s => String(s ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderMarkdown(text, { keywords = [], memorize = false } = {}) {
  const words = [...new Set(keywords.filter(k => typeof k === 'string' && k.trim()))].sort((a, b) => b.length - a.length);
  const pattern = words.length ? new RegExp(words.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const marked = new Marked({ gfm: true, breaks: false, renderer: {
    // 원시 HTML은 문자로 표시하고 코드와 링크 주소는 강조 처리에서 제외한다.
    html: html => escapeHtml(html),
    text(value) {
      const highlighted = pattern ? value.split(/(&#(?:\d+|x[\da-f]+);|&[a-z]+;)/gi).map((part, i) => i % 2 ? part : part.replace(pattern, (word, offset) => {
        if (/\w/.test(word[0]) && /\w/.test(part[offset - 1] || '')) return word;
        if (/\w/.test(word.at(-1)) && /\w/.test(part[offset + word.length] || '')) return word;
        return '<span class="study-keyword">' + word + '</span>';
      })).join('') : value;
      return memorize ? '<mark class="study-mark">' + highlighted + '</mark>' : highlighted;
    },
  } });
  return marked.parse(String(text || '')).replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, '</table></div>');
}
