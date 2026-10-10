export function problemLink(pid, concept, seen = [], from) {
  const q = new URLSearchParams();
  if (concept) {
    q.set('from', 'concept'); q.set('concept', concept);
  } else if (from) q.set('from', from);
  if (seen.length && (concept || from)) q.set('seen', [...new Set(seen)].join(','));
  return '#/p/' + encodeURIComponent(pid) + (q.size ? '?' + q : '');
}

// 집중 학습 묶음의 항목 링크. 묶음 순서를 따라 이어가도록 from=focus를 붙인다.
export function focusHref(item) {
  return item.kind === 'concept'
    ? '#/c/' + encodeURIComponent(item.cid) + '?from=focus'
    : '#/p/' + encodeURIComponent(item.pid) + '?from=focus';
}

// 묶음 안에서 현재 항목의 위치와 다음 항목. 현재 항목이 묶음에 없으면 null.
export function focusPosition(items, kind, id) {
  if (!Array.isArray(items)) return null;
  const i = items.findIndex(it => it.kind === kind && (kind === 'concept' ? it.cid : it.pid) === id);
  return i < 0 ? null : { index: i, total: items.length, next: items[i + 1] || null };
}
