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
