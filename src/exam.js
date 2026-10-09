// 모의시험(연도·회차 단위로 한 번에 풀기)의 순수 로직. 화면·네트워크와 무관하게 테스트할 수 있도록 분리했다.
// 기록: 제출하면 문제별 'attempt' 이벤트(mode: 'exam')로 남아 오답·복습 규칙에 그대로 쓰인다.
// 진행 상태(작성 중 답안·사용한 시간)는 kv 한 행 'exam:<묶음ID>'에 저장해 기기를 바꿔도 이어서 풀 수 있다.
import { grade } from './grading.js';

export const examKey = setId => 'exam:' + setId;
// 분량·시간은 실제 시험 방식 공고(큐넷)로 확인하세요. 아래 값은 연습용 기본값입니다(문항당 7.5분 = 20문항 150분 기준).
export const MINUTES_PER_QUESTION = 7.5, MAX_DEFAULT_MINUTES = 150;
export const defaultMinutes = n => Math.max(5, Math.min(MAX_DEFAULT_MINUTES, Math.round(n * MINUTES_PER_QUESTION)));

const ROUND = /^R(\d{4})-(\d)$/;

// 시험 묶음 목록: 연도별 복원 기출(회차순)과 모의고사. 문항이 없는 묶음은 제외한다.
export function examCatalog(content) {
  const visible = id => content.problems.filter(p => p.set === id && p.status !== 'hidden').length;
  const years = new Map(); const mocks = [];
  for (const s of content.sets || []) {
    const n = visible(s.id); if (!n) continue;
    const m = ROUND.exec(s.id);
    if (s.origin === 'restored' && m) {
      const y = Number(m[1]); if (!years.has(y)) years.set(y, []);
      years.get(y).push({ id: s.id, year: y, round: Number(m[2]), title: s.title, count: n });
    } else if (s.origin === 'mock') mocks.push({ id: s.id, title: s.title, count: n });
  }
  return {
    years: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, rounds]) => ({ year, rounds: rounds.sort((a, b) => a.round - b.round) })),
    mocks: mocks.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
  };
}

export const examProblems = (content, setId) =>
  content.problems.filter(p => p.set === setId && p.status !== 'hidden').sort((a, b) => (a.no - b.no) || String(a.id).localeCompare(String(b.id)));

// 정답 충돌이 풀리지 않은 문제는 확정 채점에 쓰지 않는다. 관리자 번들은 conflicts에서 계산하고, 사용자용 파일은 scoreHold 표시를 담고 있다.
export function heldProblemIds(content) {
  const held = new Set((content.problems || []).filter(p => p.scoreHold).map(p => p.id));
  for (const c of content.conflicts || []) {
    if (c.status !== 'open') continue;
    for (const l of c.links || []) { const m = /^#\/p\/(.+)$/.exec(l.href || ''); if (m) held.add(decodeURIComponent(m[1])); }
  }
  return held;
}

export function isBlank(spec, ans) {
  const a = ans || {};
  if (spec?.mode === 'parts') return !(a.parts || []).some(x => String(x ?? '').trim());
  return !String(a.text ?? '').trim();
}

const SELF_POINT = { correct: 1, partial: 0.5, wrong: 0 };

// 문항 하나의 채점: 빈 답은 '미응답', 자기 채점 문항은 표시 전까지 '자기 채점 대기'.
// 빈칸이 여러 개인 문제는 맞힌 빈칸 비율만큼 부분 점수를 준다(연습용 환산이며 공식 배점이 아님).
export function gradeQuestion(p, ans, selfMark) {
  const spec = p.grading;
  if (isBlank(spec, ans)) return { state: 'blank', earned: 0, max: 1, g: null };
  if (spec?.mode === 'self') {
    if (!selfMark) return { state: 'self_pending', earned: 0, max: 1, g: null };
    return { state: 'self_' + selfMark, earned: SELF_POINT[selfMark] ?? 0, max: 1, g: { result: selfMark, parts: [] } };
  }
  const g = grade(spec, ans || {});
  const parts = g.parts || [];
  const earned = spec?.mode === 'parts' && parts.length > 1 ? parts.filter(Boolean).length / parts.length : (g.result === 'correct' ? 1 : 0);
  return { state: g.result, earned, max: 1, g };
}

export function scoreExam(problems, answers, selfMarks = {}, held = new Set()) {
  const items = problems.map(p => {
    const r = gradeQuestion(p, answers?.[p.id], selfMarks?.[p.id]);
    return { pid: p.id, held: held.has(p.id), ...r };
  });
  const counted = items.filter(i => !i.held);
  const earned = counted.reduce((n, i) => n + i.earned, 0);
  const max = counted.reduce((n, i) => n + i.max, 0);
  return {
    items, earned, max,
    score: max ? Math.round((earned / max) * 1000) / 10 : null, // 100점 환산(연습용)
    answered: items.filter(i => i.state !== 'blank').length,
    pending: items.filter(i => i.state === 'self_pending').length,
    heldCount: items.length - counted.length,
  };
}

export const fmtClock = sec => {
  const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
};

export const newRun = (problems, limitMin, now = new Date()) => ({
  runId: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
  status: 'running', limitMin: Number(limitMin) > 0 ? Math.round(Number(limitMin)) : 0,
  usedSec: 0, startedAt: now.toISOString(), answers: {}, selfMarks: {}, n: problems.length,
});

// 이 회차에서 기록 이벤트로 남길 대상(빈 답·보류·자기 채점 대기 제외). 자기 채점은 표시한 뒤 따로 남긴다.
export function attemptsToRecord(problems, run, held = new Set()) {
  const out = [];
  for (const p of problems) {
    if (held.has(p.id)) continue;
    const a = run.answers?.[p.id];
    if (isBlank(p.grading, a) || p.grading?.mode === 'self') continue;
    const g = grade(p.grading, a);
    out.push({ pid: p.id, data: { result: g.result, hints: 0, revealed: false, answer: a, parts: g.parts, near: g.near || false, mode: 'exam', exam: p.set, run: run.runId } });
  }
  return out;
}

export function historyEntry(run, sc, now = new Date()) {
  return { runId: run.runId, submittedAt: now.toISOString(), score: sc.score, earned: sc.earned, max: sc.max, answered: sc.answered, n: run.n, usedSec: Math.round(run.usedSec), limitMin: run.limitMin };
}
