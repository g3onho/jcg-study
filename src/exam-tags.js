export const isPastExamProblem = problem => problem?.origin === 'restored';
export const hasPastExamConcept = (content, id) => (content?.problemsByConcept?.[id] || []).some(pid => isPastExamProblem(content?.problemById?.[pid]));
