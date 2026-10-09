import test from 'node:test';
import assert from 'node:assert/strict';
import { isPastExamProblem, hasPastExamConcept, conceptExamStats } from '../src/exam-tags.js';

test('복원 기출에만 기출 태그를 붙이고 모의·변형·재구성을 구분한다', () => {
  assert.equal(isPastExamProblem({ origin: 'restored' }), true);
  for (const origin of ['mock', 'variant', 'reconstructed', 'authored', undefined]) assert.equal(isPastExamProblem({ origin }), false);
});

test('개념 우선도는 복원 기출의 서로 다른 회차 수로 세며 문항 중복과 변형은 제외한다', () => {
  const problems = [
    ...['a', 'b', 'c', 'd'].map(set => ({ id: set, set, setTitle: set, origin: 'restored', concepts: set === 'a' ? ['high', 'single', 'repeat'] : set === 'b' ? ['high', 'repeat'] : [] })),
    { id: 'a2', set: 'a', origin: 'restored', concepts: ['single'] },
    { id: 'v', set: 'e', origin: 'variant', concepts: ['none'] },
  ];
  const c = { problems: [...problems, problems[0]] };
  const stats = conceptExamStats(c, 'single');
  assert.equal(stats.totalSessions, 4);
  assert.equal(stats.totalProblems, 5);
  assert.equal(stats.sessions.length, 1);
  assert.equal(stats.problemCount, 2);
  assert.equal(stats.level, 'single');
  assert.equal(conceptExamStats(c, 'high').level, 'high');
  assert.equal(conceptExamStats(c, 'none').level, 'none');
  assert.equal(conceptExamStats(null, 'unknown').level, 'none');
  c.problems.push({ id: 'e', set: 'e', origin: 'restored', concepts: [] });
  assert.equal(conceptExamStats(c, 'repeat').level, 'repeat');
});

test('핵심 여부 대신 실제 연결된 기출 문제를 기준으로 개념을 표시한다', () => {
  const content = { problemById: { r: { origin: 'restored' }, v: { origin: 'variant' } }, problemsByConcept: { array: ['r'], loop: ['v'], missing: ['unknown'] } };
  assert.equal(hasPastExamConcept(content, 'array'), true);
  for (const id of ['loop', 'missing', 'unknown']) assert.equal(hasPastExamConcept(content, id), false);
  assert.equal(hasPastExamConcept(null, 'array'), false);
});
