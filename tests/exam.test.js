import test from 'node:test';
import assert from 'node:assert/strict';
import { examCatalog, examProblems, heldProblemIds, defaultMinutes, scoreExam, isBlank, attemptsToRecord, newRun, fmtClock } from '../src/exam.js';
import { studentContent } from '../src/content-access.js';

const out = (id, a) => ({ id, set: 'R2024-3', no: Number(id.split('-').pop()), area: 'code', grading: { mode: 'output', output: { accept: [a], ws: 'line' } } });
const parts = (id, accepts) => ({ id, set: 'R2024-3', no: Number(id.split('-').pop()), area: 'theory', grading: { mode: 'parts', parts: accepts.map(a => ({ accept: [a] })) } });
const self = id => ({ id, set: 'R2024-3', no: Number(id.split('-').pop()), area: 'theory', grading: { mode: 'self', model: 'x', checklist: ['a'] } });
const content = {
  sets: [
    { id: 'R2023-2', title: '2023년 2회 복원', origin: 'restored' }, { id: 'R2024-3', title: '2024년 3회 복원', origin: 'restored' }, { id: 'R2024-1', title: '2024년 1회 복원', origin: 'restored' },
    { id: 'M10', title: '모의고사 10회', origin: 'mock' }, { id: 'M2', title: '모의고사 2회', origin: 'mock' }, { id: 'VC', title: '기출 변형 · C', origin: 'variant' }, { id: 'R2025-1', title: '빈 묶음', origin: 'restored' },
  ],
  problems: [
    out('R2024-3-02', '5'), out('R2024-3-01', '3'), parts('R2024-3-03', ['A', 'B']), self('R2024-3-04'), { ...out('R2024-3-05', '1'), status: 'hidden' },
    { id: 'R2023-2-01', set: 'R2023-2', no: 1 }, { id: 'R2024-1-01', set: 'R2024-1', no: 1 }, { id: 'M10-01', set: 'M10', no: 1 }, { id: 'M2-01', set: 'M2', no: 1 }, { id: 'VC-01', set: 'VC', no: 1 },
  ],
  conflicts: [{ id: 'CF1', status: 'open', links: [{ href: '#/p/R2024-3-02' }, { href: '#/c/x' }] }, { id: 'CF2', status: 'resolved', links: [{ href: '#/p/R2024-3-01' }] }],
};

test('시험 목록은 연도 내림차순·회차 오름차순이고 변형·빈 묶음은 뺀다', () => {
  const cat = examCatalog(content);
  assert.deepEqual(cat.years.map(y => [y.year, y.rounds.map(r => r.round)]), [[2024, [1, 3]], [2023, [2]]]);
  assert.deepEqual(cat.mocks.map(m => m.id), ['M2', 'M10']);
  assert.equal(cat.years[0].rounds[1].count, 4);
});
test('문항은 번호순이고 숨김 문항은 제외한다', () => {
  assert.deepEqual(examProblems(content, 'R2024-3').map(p => p.no), [1, 2, 3, 4]);
});
test('정답 충돌이 풀리지 않은 문제만 점수 제외 대상이다', () => {
  assert.deepEqual([...heldProblemIds(content)], ['R2024-3-02']);
  assert.deepEqual([...heldProblemIds({ problems: [{ id: 'a', scoreHold: true }, { id: 'b' }] })], ['a']);
});
test('사용자용 파일에는 충돌 내용 없이 점수 제외 표시만 남는다', () => {
  const st = studentContent({ ...content, files: [], toc: [], concepts: [], terms: [], problems: content.problems.map(p => ({ ...p, grading: p.grading || { mode: 'self' }, explanation: {} })) });
  assert.equal(st.problems.find(p => p.id === 'R2024-3-02').scoreHold, true);
  assert.equal(st.problems.find(p => p.id === 'R2024-3-01').scoreHold, undefined);
  assert.deepEqual(st.conflicts, []);
  assert.deepEqual([...heldProblemIds(st)], ['R2024-3-02']);
});
test('기본 제한 시간은 문항당 7.5분이고 150분을 넘지 않는다', () => {
  assert.equal(defaultMinutes(20), 150); assert.equal(defaultMinutes(4), 30); assert.equal(defaultMinutes(30), 150); assert.equal(defaultMinutes(0), 5);
});
test('빈 답 판정', () => {
  assert.equal(isBlank(content.problems[0].grading, { text: '  ' }), true);
  assert.equal(isBlank(content.problems[2].grading, { parts: ['', ' '] }), true);
  assert.equal(isBlank(content.problems[2].grading, { parts: ['', 'B'] }), false);
});
test('채점: 정답·부분 점수·미응답·자기 채점 대기를 구분한다', () => {
  const ps = examProblems(content, 'R2024-3');
  const answers = { 'R2024-3-01': { text: '3' }, 'R2024-3-02': { text: '9' }, 'R2024-3-03': { parts: ['A', 'x'] }, 'R2024-3-04': { text: '서술' } };
  const sc = scoreExam(ps, answers, {}, new Set(['R2024-3-02']));
  const by = Object.fromEntries(sc.items.map(i => [i.pid, i]));
  assert.equal(by['R2024-3-01'].state, 'correct');
  assert.equal(by['R2024-3-03'].earned, 0.5); assert.equal(by['R2024-3-03'].state, 'partial');
  assert.equal(by['R2024-3-04'].state, 'self_pending');
  assert.equal(sc.heldCount, 1); assert.equal(sc.max, 3); assert.equal(sc.earned, 1.5); assert.equal(sc.score, 50); assert.equal(sc.pending, 1);
  const after = scoreExam(ps, answers, { 'R2024-3-04': 'correct' }, new Set(['R2024-3-02']));
  assert.equal(after.earned, 2.5); assert.equal(after.pending, 0);
  assert.equal(scoreExam(ps, {}, {}, new Set(ps.map(p => p.id))).score, null);
  assert.equal(scoreExam(ps, {}, {}).items.every(i => i.state === 'blank'), true);
});
test('기록 이벤트: 빈 답·점수 제외·자기 채점은 남기지 않고 나머지는 exam 모드로 남긴다', () => {
  const ps = examProblems(content, 'R2024-3');
  const run = { ...newRun(ps, 30), answers: { 'R2024-3-01': { text: '3' }, 'R2024-3-02': { text: '5' }, 'R2024-3-03': { parts: ['', ''] }, 'R2024-3-04': { text: '서술' } } };
  const rec = attemptsToRecord(ps, run, new Set(['R2024-3-02']));
  assert.deepEqual(rec.map(r => r.pid), ['R2024-3-01']);
  assert.equal(rec[0].data.mode, 'exam'); assert.equal(rec[0].data.result, 'correct'); assert.equal(rec[0].data.run, run.runId);
});
test('시계 표기', () => { assert.equal(fmtClock(65), '1:05'); assert.equal(fmtClock(3725), '1:02:05'); assert.equal(fmtClock(-3), '0:00'); });
