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

test('암기 구절은 마크다운 구조를 유지하고 기본 렌더링과 다른 호출에 영향을 주지 않는다', () => {
  const marked = renderMarkdown('- **정의**: 배열 `a[0]`', { keywords: ['정의'], memoryTerms: ['배열'] });
  assert.match(marked, /<ul>/);
  assert.match(marked, /<mark class="study-mark">/);
  assert.match(marked, /<span class="study-keyword">정의<\/span>/);
  assert.equal(renderMarkdown('배열'), '<p>배열</p>\n');
  assert.match(renderMarkdown('| A |\n| - |\n| 값 |'), /<div class="tbl"><table>/);
});

test('첫 문장 자동 강조 대신 선택한 답안 요소만 항목 위치와 무관하게 표시한다', () => {
  const html = renderMarkdown('- 먼저 읽을 설명.\n- **데이터 모델 구성 3요소**: 구조(Structure), 연산(Operation), 제약조건(Constraint).', { keywords: ['데이터 모델 구성 3요소'], memoryTerms: ['구조(Structure)', '연산(Operation)', '제약조건(Constraint)'] });
  assert.match(html, /<li>먼저 읽을 설명\.<\/li>/);
  assert.match(html, /<strong><span class="study-keyword">데이터 모델 구성 3요소<\/span><\/strong>/);
  assert.equal((html.match(/<mark /g) || []).length, 3);
  for (const term of ['구조(Structure)', '연산(Operation)', '제약조건(Constraint)']) assert.ok(html.includes('<mark class="study-mark">' + term + '</mark>'));
  assert.ok(!renderMarkdown('정의입니다. 다음 문장입니다.').includes('<mark'));
});

test('암기 구절이 키워드와 겹치면 형광펜만 쓰고 코드·링크·엔티티는 보존한다', () => {
  const html = renderMarkdown('**원자성**과 원자성. `원자성` [원자성](https://example.com/원자성) &amp; <b>원자성</b>', { keywords: ['원자성'], memoryTerms: ['원자성', 'amp'] });
  assert.ok(!html.includes('study-keyword'));
  assert.match(html, /<code><mark class="study-mark">원자성<\/mark><\/code>/);
  assert.ok(html.includes('href="' + encodeURI('https://example.com/원자성') + '"'));
  assert.ok(!html.includes('&<mark'));
  assert.ok(!html.includes('<b>'));
});

test('선택한 SQL 명령·식은 인라인 코드에서도 강조하고 코드 블록은 그대로 둔다', () => {
  const html = renderMarkdown('`CREATE`와 `DROP`\n\n```sql\nCREATE TABLE t(id int);\n```', { keywords: ['DROP'], memoryTerms: ['CREATE'] });
  assert.match(html, /<code><mark class="study-mark">CREATE<\/mark><\/code>/);
  assert.match(html, /<code>DROP<\/code>/);
  assert.match(html, /<pre><code class="language-sql">CREATE TABLE t\(id int\);/);
});

test('더 긴 빨간 키워드에 포함된 답안도 형광펜을 우선한다', () => {
  const html = renderMarkdown('관계 데이터 모델', { keywords: ['관계 데이터 모델'], memoryTerms: ['데이터 모델'] });
  assert.match(html, /관계 <mark class="study-mark">데이터 모델<\/mark>/);
});
