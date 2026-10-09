export function problemLink(pid, concept, seen = []) {
  const q = new URLSearchParams();
  if (concept) {
    q.set('from', 'concept'); q.set('concept', concept);
    if (seen.length) q.set('seen', [...new Set(seen)].join(','));
  }
  return '#/p/' + encodeURIComponent(pid) + (q.size ? '?' + q : '');
}
