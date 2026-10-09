export const PRIORITY_LABEL = { essential: '💯', core: '⭐ 핵심', supplement: '🔥 보조', later: '🤔 후순위', unrated: '중요도 미지정' };

export function getStudyPriority(concept) {
  const levels = new Set((concept?.studyPriority?.topics || []).map(t => t.level));
  return ['essential', 'core', 'supplement', 'later'].find(level => levels.has(level)) || 'unrated';
}
