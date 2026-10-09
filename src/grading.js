// 미리 검토한 허용 답안 기준의 결정적 채점. (AI 채점 아님)
const QUOTES = /[‘’‛′＇`]/g, DQUOTES = /[“”″＂]/g;
export function normalize(s, norm) {
  s = String(s ?? '').replace(QUOTES, "'").replace(DQUOTES, '"').replace(/ /g, ' ').trim();
  if (norm === 'exact') return s;
  s = s.replace(/\s+/g, '');
  if (norm === 'ns') return s;
  return s.toLowerCase(); // ns_ci (기본)
}

function outLines(s, ws) {
  let lines = String(s ?? '').replace(/\r/g, '').replace(QUOTES, "'").replace(DQUOTES, '"').split('\n').map(l => l.replace(/\s+$/, ''));
  if (ws === 'collapse') lines = lines.map(l => l.replace(/\s+/g, ' ').trim());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function splitItems(s) { return String(s ?? '').split(/[,\n/·、;]+|\s{2,}/).map(x => x.trim()).filter(Boolean); }

function partCorrect(part, value, alias) {
  if (part.items) {
    const want = new Set(splitItems(part.accept[0]).map(x => normalize(x, part.norm)));
    const altSets = part.accept.slice(1).map(a => new Set(splitItems(a).map(x => normalize(x, part.norm))));
    const got = splitItems(value).map(x => normalize(x, part.norm)).map(x => {
      if (!alias) return x;
      for (const [canon, alts] of Object.entries(alias)) if (alts.map(a => normalize(a, part.norm)).includes(x)) return normalize(canon, part.norm);
      return x;
    });
    const g = new Set(got);
    const eq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    if (eq(g, want) || altSets.some(s => eq(g, s))) return true;
    // 기호 묶음(예: ㉮㉰)처럼 구분자 없이 쓴 경우
    const compact = normalize(value, part.norm);
    return part.accept.some(a => normalize(a, part.norm) === compact);
  }
  const v = normalize(value, part.norm);
  if (part.accept.some(a => normalize(a, part.norm) === v)) return true;
  return false;
}

export function grade(spec, answer) {
  // answer: {text} for output/self, {parts:[...]} for parts
  if (!spec) return { result: 'self', parts: [] };
  if (spec.mode === 'self') return { result: 'self', parts: [] };
  if (spec.mode === 'output') {
    const got = outLines(answer.text, spec.output.ws);
    const ok = spec.output.accept.some(a => outLines(a, spec.output.ws) === got);
    let near = false;
    if (!ok) near = spec.output.accept.some(a => outLines(a, 'collapse').replace(/\s/g, '') === got.replace(/\s/g, ''));
    return { result: ok ? 'correct' : 'wrong', parts: [], near };
  }
  if (spec.setlike) {
    const items = s => new Set(String(s || '').replace(/[{}\s'"]/g, '').split(',').filter(Boolean));
    const a = items(answer.parts?.[0]), b = items(spec.parts[0].accept[0]);
    const ok = a.size === b.size && [...a].every(x => b.has(x));
    return { result: ok ? 'correct' : 'wrong', parts: [ok] };
  }
  if (spec.seq) {
    const d = s => (String(s || '').match(/\d+/g) || []).join(',');
    const ok = d(answer.parts?.[0]) === d(spec.parts[0].accept[0]);
    return { result: ok ? 'correct' : 'wrong', parts: [ok] };
  }
  const vals = answer.parts || [];
  let parts = spec.parts.map((p, i) => partCorrect(p, vals[i], spec.alias));
  if (spec.combos) {
    const v = spec.parts.map((p, i) => normalize(vals[i], p.norm));
    const ok = spec.combos.some(c => c.every((x, i) => normalize(x, spec.parts[i].norm) === v[i]));
    parts = parts.map(() => ok);
  }
  const n = parts.filter(Boolean).length;
  return { result: n === parts.length ? 'correct' : n > 0 ? 'partial' : 'wrong', parts };
}
