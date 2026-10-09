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

test('lead 모드는 같은 암기 용어를 처음 한 번만 형광펜으로 표시하고 표 안은 표시하지 않는다', () => {
  const md = '- 싱글턴(Singleton): 인스턴스를 하나만 생성. 싱글턴은 전역 접근.\n- 프로토타입: 복제. 싱글턴과 다름.\n\n| 계층 | 장비 |\n|---|---|\n| 응용 | 싱글턴 |';
  const html = renderMarkdown(md, { memoryTerms: ['싱글턴', '프로토타입'], memoryMode: 'lead' });
  assert.equal((html.match(/<mark /g) || []).length, 2);
  assert.ok(html.includes('<mark class="study-mark">싱글턴</mark>(Singleton)'));
  assert.ok(html.includes('<mark class="study-mark">프로토타입</mark>'));
  assert.ok(/<table>[\s\S]*싱글턴[\s\S]*<\/table>/.test(html) && !/<table>[\s\S]*<mark[\s\S]*<\/table>/.test(html));
  assert.ok((renderMarkdown(md, { memoryTerms: ['싱글턴'] }).match(/<mark /g) || []).length > 2);
});

test('lead 모드는 같은 용어를 처음 나온 곳에만 표시하고, 조사가 붙은 **굵게**도 처리한다', () => {
  const md = '- 개념 스키마(조직 전체)와 외부 스키마.\n- 논리적 독립성: 개념 스키마가 바뀌어도 영향 없음.\n\n**릴레이션 내포(Intension)**라고도 한다.';
  const html = renderMarkdown(md, { memoryTerms: ['개념 스키마', '외부 스키마', '논리적 독립성'], memoryMode: 'lead' });
  assert.equal((html.match(/<mark /g) || []).length, 3);
  assert.equal((html.match(/<mark class="study-mark">개념 스키마<\/mark>/g) || []).length, 1);
  assert.ok(html.includes('<mark class="study-mark">논리적 독립성</mark>'));
  assert.ok(html.includes('<strong>릴레이션 내포(Intension)</strong>라고도') && !html.includes('**'));
});

test('감자 ❗ 항목은 본문의 해당 항목 옆에 한 번만 붙고 못 찾은 항목은 돌려준다', async () => {
  const { placeExamMarks } = await import('../src/study-markdown.js');
  const r = placeExamMarks({ definition: '- **속성(Attribute)**: 열.\n- 동치 분할(Equivalence): 입력 그룹화.\n```\n튜플\n```' }, ['Attribute(속성)', '동등 분할', '튜플', '없는 항목']);
  assert.ok(r.texts.definition.includes('**속성(Attribute)**'));
  assert.ok(r.texts.definition.includes('동치 분할(Equivalence)') || r.texts.definition.includes('동치 분할(Equivalence)'));
  assert.deepEqual(r.unmatched, ['튜플', '없는 항목']);
  const html = renderMarkdown(r.texts.definition);
  assert.equal((html.match(/class="ex-mark"/g) || []).length, 2);
  assert.ok(!html.includes(''));
});

test('키워드 칩 "A = B": B(설명)는 통째로, A의 영문 표기는 단서로 빨갛게 표시한다', () => {
  assert.equal(renderStudyText('차수(Degree) = 속성 수', { keywords: ['Degree'], tailCue: true }), '차수(<span class="study-keyword">Degree</span>) = <span class="study-keyword">속성 수</span>');
  assert.equal(renderStudyText('튜플 = 행', {}), '튜플 = 행');
  assert.equal(renderStudyText('구조·연산·제약조건', { tailCue: true }), '구조·연산·제약조건');
});

test('영문 단서는 노란 용어와 겹치지 않으면 본문에서 빨갛게 표시한다', () => {
  const html = renderMarkdown('- **속성(Attribute)**: 열', { keywords: ['Attribute'], memoryTerms: ['속성'] });
  assert.match(html, /<span class="study-keyword">Attribute<\/span>/);
  assert.match(html, /<mark class="study-mark">속성<\/mark>/);
});

test('unit 모드: 같은 용어를 문단·항목마다 한 번씩 칠하고, 인용 문장은 굵게 한다', () => {
  const md = '- 차수(Degree)는 열. Degree 다시.\n- Degree는 또 나온다.';
  const html = renderMarkdown(md, { keywords: ['Degree'], keywordOnce: 'unit' });
  assert.equal((html.match(/study-keyword/g) || []).length, 2);
  const once = renderMarkdown(md, { keywords: ['Degree'], keywordOnce: true });
  assert.equal((once.match(/study-keyword/g) || []).length, 1);
  const y = renderMarkdown('튜플은 행. 튜플 또.\n\n튜플 셋.', { memoryTerms: ['튜플'], memoryMode: 'unit' });
  assert.equal((y.match(/study-mark/g) || []).length, 2);
  assert.match(renderMarkdown('틀린다: “Degree = 열” 이다.', { boldQuotes: true }), /<strong>“Degree = 열”<\/strong>/);
});
