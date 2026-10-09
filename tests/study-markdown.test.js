import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderStudyText } from '../src/study-markdown.js';

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

test('설명 속 긴 식별 특징은 내부 용어와 겹쳐도 빨간색을 유지한다', () => {
  const html = renderMarkdown('차수: 속성의 개수. 2NF: 부분 함수 종속 제거.', { keywords: ['속성의 개수', '부분 함수 종속 제거'], memoryTerms: ['차수', '속성', '2NF', '부분 함수 종속'] });
  for (const term of ['차수', '2NF']) assert.ok(html.includes('<mark class="study-mark">'+term+'</mark>'));
  for (const term of ['속성의 개수', '부분 함수 종속 제거']) assert.ok(html.includes('<span class="study-keyword">'+term+'</span>'));
});

test('용어·분류는 형광펜, 정의 속 식별 특징은 빨간색으로 구분한다', () => {
  const html = renderMarkdown('**생성 패턴(Creational)**\n\n- 싱글턴(Singleton): 인스턴스를 **하나만** 생성.', { memoryTerms: ['생성 패턴', '싱글턴'], keywords: ['하나만'] });
  assert.ok(html.includes('<mark class="study-mark">생성 패턴</mark>'));
  assert.ok(html.includes('<mark class="study-mark">싱글턴</mark>'));
  assert.ok(html.includes('<span class="study-keyword">하나만</span>'));
  assert.ok(!html.includes('<mark class="study-mark">하나만</mark>'));
});

test('키워드 요약은 밑줄·별표·HTML 문자를 보존하며 색상만 적용한다', () => {
  for (const text of ['__init__ / self', 'super().__init__()', '* 역참조']) {
    const html=renderStudyText(text,{memoryTerms:['__init__','역참조']});
    assert.equal(html.replace(/<mark class="study-mark">|<\/mark>/g,''),text);
  }
  assert.equal(renderStudyText('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
