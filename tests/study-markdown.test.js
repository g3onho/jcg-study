import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/study-markdown.js';

test('키워드의 긴 일치부터 강조하며 코드·원시 HTML·엔티티를 변형하지 않는다', () => {
  const html = renderMarkdown('**배열**은 인덱스로 접근. print printf footprint C++ &amp;\n\n`print 배열`\n\n```c\nprintf("배열");\n```\n\n<img src=x onerror=alert(1)>', { keywords: ['배열', 'print', 'printf', 'C++', 'amp'] });
  assert.match(html, /<strong><span class="study-keyword">배열<\/span><\/strong>/);
  assert.match(html, /<span class="study-keyword">printf<\/span>/);
  assert.match(html, /<span class="study-keyword">C\+\+<\/span>/);
  assert.match(html, /footprint/);
  assert.match(html, /<code>print 배열<\/code>/);
  assert.match(html, /printf\(&quot;배열&quot;\);/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('&<span'));
});

test('암기 문장은 마크다운 구조를 유지하고 기본 렌더링과 다른 호출에 영향을 주지 않는다', () => {
  const marked = renderMarkdown('- **정의**: 배열 `a[0]`', { keywords: ['배열'], memorize: true });
  assert.match(marked, /<ul>/);
  assert.match(marked, /<mark class="study-mark">/);
  assert.match(marked, /<span class="study-keyword">배열<\/span>/);
  assert.equal(renderMarkdown('배열'), '<p>배열</p>\n');
  assert.match(renderMarkdown('| A |\n| - |\n| 값 |'), /<div class="tbl"><table>/);
});
