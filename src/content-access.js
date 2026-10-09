// 원본 번들은 관리자만 받는다. 사용자용 파일은 허용한 학습 필드만 새로 구성한다.
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
const verification = list => (list || []).map(v => ({ type: v.type }));
const table = t => pick(t, ['head', 'rows', 'caption']);
const grading = g => {
  const out = pick(g, ['mode', 'model', 'checklist', 'answerHint', 'gnote', 'norm_note', 'stdin', 'itemized', 'setlike', 'seq', 'alias', 'combos']);
  if (g?.output) out.output = pick(g.output, ['accept', 'ws', 'case']);
  if (g?.parts) out.parts = g.parts.map(p => pick(p, ['label', 'accept', 'norm', 'items']));
  return out;
};

export function studentContent(c) {
  const out = {
    ...pick(c, ['version', 'built_at']), files: [], conflicts: [], coverage: [],
    toc: (c.toc || []).map(u => pick(u, ['id', 'area', 'title', 'std', 'concepts'])),
    sets: (c.sets || []).map(s => pick(s, ['id', 'title', 'origin', 'count'])),
    terms: (c.terms || []).map(t => pick(t, ['term', 'alias', 'def', 'concept'])),
    concepts: (c.concepts || []).map(x => ({
      ...pick(x, ['id', 'area', 'unit', 'title', 'order', 'prereq', 'summary', 'easy', 'definition', 'compare', 'pitfalls', 'keywords', 'memoryTerms', 'studyKeywords', 'mnemonic', 'core', 'related']),
      verification: verification(x.verification),
      ...(x.studyPriority ? { studyPriority: { ...pick(x.studyPriority, ['partial']), topics: (x.studyPriority.topics || []).map(t => pick(t, ['title', 'level'])) } } : {}),
      examples: (x.examples || []).map(e => ({ ...pick(e, ['title', 'lang', 'code', 'output', 'env', 'explain']), ...(e.trace ? { trace: table(e.trace) } : {}) })),
      recall: (x.recall || []).map(r => pick(r, ['q', 'a'])),
      checks: (x.checks || []).map(q => ({ ...pick(q, ['id', 'q', 'code', 'lang', 'answer_display', 'explain']), grading: grading(q.grading) })),
    })),
    problems: (c.problems || []).map(p => ({
      ...pick(p, ['id', 'set', 'setTitle', 'no', 'origin', 'area', 'lang', 'title', 'prompt', 'code', 'notice', 'reconstructed', 'answer_display', 'concepts', 'tags', 'status', 'order', 'hints', 'ai_notes']),
      ...(p.tables ? { tables: p.tables.map(table) } : {}),
      grading: grading(p.grading), verification: verification(p.verification),
      explanation: { ...pick(p.explanation, ['summary', 'steps', 'trace', 'points', 'pitfalls', 'format', 'note']), ...(p.explanation?.trace_table ? { trace_table: table(p.explanation.trace_table) } : {}) },
    })),
  };
  // 학습 문장 안에 섞인 제공자·파일명·원본 링크도 사용자용 파일에서 제외한다.
  function redact(v) {
    if (typeof v === 'string') return v.replace(/\([^)]*(?:주말코딩|감자\s*(?:요약|이론|코딩))[^)]*\)/g, '').replace(/주말코딩|감자\s*(?:요약|이론|코딩)/g, '학습 자료').replace(/[^\s<>"'()\[\]]+\.pdf/gi, '[자료명 비공개]').replace(/\[([^\]]+)\]\((?:https?:|file:)[^)]+\)/gi, '$1').replace(/https?:\/\/\S+/g, '[링크 비공개]');
    if (Array.isArray(v)) return v.map(redact);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, redact(value)]));
    return v;
  }
  // 코드·정답·채점 문자열은 절대 바꾸지 않는다.
  for (const x of out.concepts) {
    for (const k of ['title', 'summary', 'easy', 'definition', 'compare', 'pitfalls', 'mnemonic']) if (k in x) x[k] = redact(x[k]);
    for (const e of x.examples) for (const k of ['title', 'explain']) if (k in e) e[k] = redact(e[k]);
    for (const q of x.checks) for (const k of ['q', 'explain']) if (k in q) q[k] = redact(q[k]);
  }
  for (const p of out.problems) {
    p.explanation = redact(p.explanation);
    for (const k of ['notice', 'reconstructed', 'ai_notes', 'hints']) if (k in p) p[k] = redact(p[k]);
  }
  return out;
}
