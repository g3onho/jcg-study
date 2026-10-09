import test from 'node:test';
import assert from 'node:assert/strict';
import { studentContent } from '../src/content-access.js';

test('일반 사용자 콘텐츠에는 파일·출처·검증 상세가 전달되지 않는다', () => {
  const source = {
    version: '1', files: [{ path: 'secret/book.pdf' }], conflicts: [{ source: 'secret' }],
    sets: [{ id: 's', title: '연습', file: 'F01' }], toc: [], terms: [],
    concepts: [{ id: 'a', title: '배열', sources: [{ file: 'F01' }], examples: [{ title: '예제', code: 'x[0]', verified: 'secret.pdf p.4' }], checks: [], verification: [{ type: '추가 확인 필요', detail: 'secret/book.pdf' }] }],
    problems: [{ id: 'p', prompt: '출력?', sources: [{ file: 'F01' }], answer_source: '주말코딩', grading: { mode: 'output', output: { accept: ['1'], ws: 'line' } }, answer_display: '1', explanation: { provider: 'secret', steps: ['값은 1'] }, verification: [], image: 'crops/p.png', secret_future_field: 'private' }],
  };
  const result = studentContent(source);
  assert.deepEqual(result.problems[0].grading, source.problems[0].grading);
  assert.equal(result.problems[0].image, undefined);
  assert.deepEqual(result.problems[0].explanation.steps, ['값은 1']);
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.concepts[0].verification, [{ type: '추가 확인 필요' }]);
  const text = JSON.stringify(result);
  for (const value of ['secret', 'F01', '.pdf', '주말코딩', 'secret_future_field']) assert.equal(text.includes(value), false, value);
  assert.equal(source.problems[0].answer_source, '주말코딩');
});

test('사용자에게 중요도만 제공하고 그 출처·페이지는 제외한다', () => {
  const source = { concepts: [{ id: 'a', memoryTerms: ['구조', '연산', '제약조건'], studyPriority: { source: { file: 'F26', path: 'secret.pdf' }, reviewed_at: 'private', topics: [{ title: '설계', level: 'core', pdf_page: 6, note: 'private' }] } }] };
  assert.deepEqual(studentContent(source).concepts[0].studyPriority, { topics: [{ title: '설계', level: 'core' }] });
  assert.deepEqual(studentContent(source).concepts[0].memoryTerms, ['구조', '연산', '제약조건']);
  assert.equal(studentContent({ concepts: [{ id: 'b' }] }).concepts[0].studyPriority, undefined);
});
