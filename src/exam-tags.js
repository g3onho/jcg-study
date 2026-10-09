export const isPastExamProblem = problem => problem?.origin === 'restored';
export const hasPastExamConcept = (content, id) => (content?.problemsByConcept?.[id] || []).some(pid => isPastExamProblem(content?.problemById?.[pid]));

export const EXAM_LEVEL = { high: '빈출', repeat: '반복 출제', single: '단일 회차', none: '기출 연결 없음' };

export function conceptExamStats(content, id) {
  const restored = [...new Map((content?.problems || []).filter(isPastExamProblem).map(p => [p.id, p])).values()];
  const allSessions = new Set(restored.map(p => p.set).filter(Boolean));
  const linked = restored.filter(p => p.concepts?.includes(id));
  const groups = new Map();
  for (const p of linked) {
    if (!p.set) continue;
    if (!groups.has(p.set)) groups.set(p.set, { id: p.set, title: p.setTitle || p.set, problems: [] });
    groups.get(p.set).problems.push(p);
  }
  const sessions = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  const n = sessions.length, totalSessions = allSessions.size;
  const level = !n ? 'none' : n === 1 ? 'single' : n * 2 >= totalSessions ? 'high' : 'repeat';
  return { sessions, totalSessions, problemCount: linked.length, totalProblems: restored.length, level };
}
