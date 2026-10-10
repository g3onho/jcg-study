import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendProblem } from '../src/engine.js';

const problems = [
  { id: 'other', concepts: ['b'], area: 'sql' },
  { id: 'first', concepts: ['a'], area: 'code' },
  { id: 'second', concepts: ['a'], area: 'code' },
  { id: 'hidden', concepts: ['a'], area: 'code', status: 'hidden' },
];
const content = { problems, problemById: Object.fromEntries(problems.map(p => [p.id, p])), conceptById: { a: { title: '배열' } } };
const due = { other: { level: 1, last: { at: '2026-01-01', hints: 0 }, due: '2026-01-02', status: 'wrong', wrongCount: 1, causes: {} } };

test('개념 학습에서는 다른 개념의 복습보다 연결 문제를 먼저 추천한다', () => {
  assert.equal(recommendProblem(content, {}, due, { preferConcept: 'a', exclude: new Set(['first']) }).pid, 'second');
});
test('개념 문제를 모두 풀면 다른 개념으로 자동 이동하지 않는다', () => {
  assert.equal(recommendProblem(content, {}, due, { preferConcept: 'a', exclude: new Set(['first', 'second']) }), null);
});
test('풀어 본 연결 문제도 한 묶음 안에서 빠뜨리지 않는다', () => {
  const pst = { first: { level: 2 }, second: { level: 2 } };
  assert.equal(recommendProblem(content, {}, pst, { preferConcept: 'a', exclude: new Set(['first']) }).pid, 'second');
});
test('일반 문제 추천은 기존 전체 범위 복습을 유지한다', () => {
  assert.equal(recommendProblem(content, {}, due).pid, 'other');
});

import { problemLink, focusHref, focusPosition } from '../src/study-links.js';
const fitems = [{ kind: 'problem', pid: 'p1' }, { kind: 'concept', cid: 'c1' }, { kind: 'problem', pid: 'p2' }];
test('집중 학습은 묶음 순서대로 다음 항목을 가리킨다', () => {
  assert.deepEqual(focusPosition(fitems, 'problem', 'p1'), { index: 0, total: 3, next: fitems[1] });
  assert.equal(focusPosition(fitems, 'concept', 'c1').next.pid, 'p2');
  assert.equal(focusPosition(fitems, 'problem', 'p2').next, null);
});
test('묶음에 없는 항목이나 묶음이 없으면 집중 학습으로 보지 않는다', () => {
  assert.equal(focusPosition(fitems, 'problem', 'zzz'), null);
  assert.equal(focusPosition(undefined, 'problem', 'p1'), null);
});
test('집중 학습 링크는 from=focus를 유지한다', () => {
  assert.equal(focusHref(fitems[0]), '#/p/p1?from=focus');
  assert.equal(focusHref(fitems[1]), '#/c/c1?from=focus');
});
test('일반 문제 링크는 시작 경로와 본 문제를 이어 전달한다', () => {
  assert.equal(problemLink('p2', null, ['p1'], 'review'), '#/p/p2?from=review&seen=p1');
  assert.equal(problemLink('p2'), '#/p/p2');
  assert.equal(problemLink('p2', 'c1', ['p1']), '#/p/p2?from=concept&concept=c1&seen=p1');
});
