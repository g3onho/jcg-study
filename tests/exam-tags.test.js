import test from 'node:test';
import assert from 'node:assert/strict';
import { isPastExamProblem, hasPastExamConcept } from '../src/exam-tags.js';

test('복원 기출에만 기출 태그를 붙이고 모의·변형·재구성을 구분한다', () => {
  assert.equal(isPastExamProblem({ origin: 'restored' }), true);
  for (const origin of ['mock', 'variant', 'reconstructed', 'authored', undefined]) assert.equal(isPastExamProblem({ origin }), false);
});

test('핵심 여부 대신 실제 연결된 기출 문제를 기준으로 개념을 표시한다', () => {
  const content = { problemById: { r: { origin: 'restored' }, v: { origin: 'variant' } }, problemsByConcept: { array: ['r'], loop: ['v'], missing: ['unknown'] } };
  assert.equal(hasPastExamConcept(content, 'array'), true);
  for (const id of ['loop', 'missing', 'unknown']) assert.equal(hasPastExamConcept(content, id), false);
  assert.equal(hasPastExamConcept(null, 'array'), false);
});
