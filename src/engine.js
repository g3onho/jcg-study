// 저장된 기록으로 계산하는 단순·설명 가능한 규칙. (실시간 AI 분석 아님)
import { EXAM_DATE } from './config.js';

const DAY = 86400000;
const dayKey = iso => new Date(iso).toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
export const today = () => new Date();
export function daysToExam(now = today()) {
  const ex = new Date(EXAM_DATE + 'T00:00:00+09:00');
  const n = new Date(now.toLocaleDateString('sv-SE') + 'T00:00:00+09:00');
  return Math.round((ex - n) / DAY);
}
const isCorrect = r => r === 'correct' || r === 'self_correct';
const isWrongish = r => ['wrong', 'partial', 'self_wrong', 'self_partial'].includes(r);

export function problemStates(events) {
  const st = {};
  for (const e of events) {
    if (e.type === 'attempt') {
      const s = (st[e.item_id] ||= { attempts: [], causes: {} });
      s.attempts.push({ id: e.id, at: e.client_at || e.created_at, ...e.data });
    } else if (e.type === 'cause') {
      const s = (st[e.item_id] ||= { attempts: [], causes: {} });
      s.causes[e.data.attempt_id] = e.data.cause;
    }
  }
  for (const [pid, s] of Object.entries(st)) Object.assign(s, summarize(s));
  return st;
}

function summarize(s) {
  const a = s.attempts.filter(x => x.result !== 'revealed');
  if (!a.length) return { level: 0, status: 'new' };
  const last = a[a.length - 1];
  const anyCorrect = a.some(x => isCorrect(x.result));
  // '나중에 다시 맞힘': 이전 시도와 다른 날에 다시 정답 + 마지막 시도가 정답
  let later = false;
  for (let i = 1; i < a.length; i++) if (isCorrect(a[i].result) && dayKey(a[i].at) !== dayKey(a[0].at)) later = true;
  later = later && isCorrect(last.result);
  const level = later ? 3 : anyCorrect ? 2 : 1;
  const wrongCount = a.filter(x => isWrongish(x.result)).length;
  const lastClean = isCorrect(last.result) && !last.hints && !last.revealed;
  let interval;
  if (isWrongish(last.result)) interval = 1;
  else if (!lastClean) interval = 2;
  else if (later) interval = a.filter(x => isCorrect(x.result)).length >= 3 ? 16 : 8;
  else interval = 4;
  let due = new Date(new Date(last.at).getTime() + interval * DAY);
  // 시험 전에 한 번 더 확인할 수 있도록 간격을 시험 이틀 전까지로 제한
  const exam = new Date(EXAM_DATE + 'T00:00:00+09:00');
  if (new Date() < exam && due > new Date(exam.getTime() - 2 * DAY)) due = new Date(Math.max(new Date(last.at).getTime() + DAY, exam.getTime() - 2 * DAY));
  const status = isCorrect(last.result) ? 'correct' : 'wrong';
  return { level, status, last, wrongCount, lastClean, due: due.toISOString(), interval, firstAt: a[0].at, count: a.length };
}

export function conceptStates(events) {
  const st = {};
  for (const e of events) {
    if (e.type === 'concept_read') (st[e.item_id] ||= { checks: {} }).readAt = e.client_at || e.created_at;
    if (e.type === 'concept_check') {
      const s = (st[e.item_id] ||= { checks: {} });
      s.checks[e.data.qid] = { result: e.data.result, at: e.client_at || e.created_at };
    }
  }
  return st;
}

export const LEVEL_LABEL = ['미풀이', '직접 풀어봄', '맞힘', '나중에 다시 맞힘'];

export function reviewQueue(content, pst, now = new Date()) {
  const items = [];
  for (const [pid, s] of Object.entries(pst)) {
    const p = content.problemById[pid]; if (!p || !s.last) continue;
    if (new Date(s.due) > now) continue;
    const reasons = [];
    const ago = Math.max(0, Math.round((now - new Date(s.last.at)) / DAY));
    if (s.status === 'wrong') reasons.push(`${ago ? ago + '일 전' : '오늘'} 틀림`);
    else if (!s.lastClean) reasons.push(s.last.revealed ? '해설을 보고 맞힘' : `힌트 ${s.last.hints}개 사용`);
    else reasons.push(`${ago}일 전 맞힘 · 다시 확인할 때`);
    if (s.wrongCount >= 2) reasons.push(`누적 오답 ${s.wrongCount}회`);
    const cause = Object.values(s.causes).slice(-1)[0];
    if (cause) reasons.push('원인: ' + cause);
    const score = (s.status === 'wrong' ? 30 : 10) + s.wrongCount * 5 + (s.lastClean ? 0 : 5) - Math.min(ago, 10) * 0.1;
    items.push({ pid, score, reasons });
  }
  return items.sort((a, b) => b.score - a.score);
}

export function areaOf(p) { return p.area; }

export function recommendConcept(content, cst, pst, now = new Date()) {
  const dleft = daysToExam(now);
  const order = content.concepts.slice().sort((a, b) => a.order - b.order);
  const isRead = c => !!cst[c.id]?.readAt;
  // 1) 반복 오답이 쌓인 개념(최근 14일 연결 문제 오답 2회 이상) 재확인
  const weak = [];
  for (const c of order) {
    const pids = content.problemsByConcept[c.id] || [];
    let w = 0;
    for (const pid of pids) { const s = pst[pid]; if (s?.attempts) w += s.attempts.filter(a => isWrongish(a.result) && now - new Date(a.at) < 14 * DAY).length; }
    if (w >= 2) weak.push({ c, w });
  }
  weak.sort((a, b) => b.w - a.w);
  // 2) 아직 읽지 않은 범위(선수 개념 충족 우선)
  const unread = order.filter(c => !isRead(c));
  const ready = unread.filter(c => (c.prereq || []).every(id => cst[id]?.readAt));
  let pick = null, reason = '';
  if (dleft <= 7 && dleft >= 0) {
    const core = ready.find(c => c.core) || unread.find(c => c.core);
    if (core) { pick = core; reason = `시험 D-${dleft}: 아직 확인하지 않은 핵심 개념 (${core.coreNote || '복원 기출 연결'})`; }
  }
  if (!pick && weak.length && (!ready.length || weak[0].w >= 3)) {
    pick = weak[0].c; reason = `최근 2주 연결 문제 오답 ${weak[0].w}회 — 개념 재확인`;
  }
  if (!pick && ready.length) {
    pick = ready[0];
    const pre = (pick.prereq || []).map(id => content.conceptById[id]?.title).filter(Boolean);
    reason = pre.length ? `아직 확인하지 않은 범위 · 선수 개념(${pre.join(', ')}) 완료` : '아직 확인하지 않은 범위 (목차 순서)';
  }
  if (!pick && unread.length) { pick = unread[0]; reason = '아직 확인하지 않은 범위'; }
  if (!pick && weak.length) { pick = weak[0].c; reason = `연결 문제 오답 ${weak[0].w}회 — 재확인`; }
  if (!pick) {
    // 모두 읽음 → 가장 오래전에 읽은 개념
    pick = order.slice().sort((a, b) => (cst[a.id]?.readAt || '').localeCompare(cst[b.id]?.readAt || ''))[0];
    reason = '모든 개념을 한 번씩 확인함 — 가장 오래전에 본 개념 다시 보기';
  }
  return pick ? { concept: pick, reason } : null;
}

export function areaBalance(content, pst) {
  const areas = {};
  for (const p of content.problems) {
    const a = (areas[p.area] ||= { total: 0, tried: 0 });
    a.total++; if (pst[p.id]?.level) a.tried++;
  }
  return areas;
}

export function recommendProblem(content, cst, pst, { exclude = new Set(), preferConcept } = {}) {
  const now = new Date();
  if (preferConcept) {
    const linked = content.problems.filter(p => p.status !== 'hidden' && !exclude.has(p.id) && (p.concepts || []).includes(preferConcept));
    const due = reviewQueue(content, pst, now).find(x => linked.some(p => p.id === x.pid));
    if (due) return { pid: due.pid, reason: '이 개념의 복습 문제: ' + due.reasons.join(' · ') };
    const p = linked.find(p => !pst[p.id]?.level) || linked[0];
    return p ? { pid: p.id, reason: `${content.conceptById[preferConcept]?.title || '현재 개념'}의 연결 문제` } : null;
  }
  const due = reviewQueue(content, pst, now).filter(x => !exclude.has(x.pid));
  if (due.length) return { pid: due[0].pid, reason: '우선 복습: ' + due[0].reasons.join(' · ') };
  const fresh = content.problems.filter(p => !pst[p.id]?.level && !exclude.has(p.id) && p.status !== 'hidden');
  // 최근에 읽은 개념과 연결된 새 문제
  const recent = Object.entries(cst).filter(([, s]) => s.readAt).sort((a, b) => b[1].readAt.localeCompare(a[1].readAt)).map(([id]) => id);
  for (const cid of recent.slice(0, 5)) {
    const f = fresh.find(p => (p.concepts || []).includes(cid));
    if (f) return { pid: f.id, reason: `최근 확인한 개념(${content.conceptById[cid]?.title})과 연결된 새 문제` };
  }
  // 영역 균형: 시도 비율이 가장 낮은 영역
  const bal = areaBalance(content, pst);
  const areas = Object.entries(bal).sort((a, b) => a[1].tried / a[1].total - b[1].tried / b[1].total);
  for (const [area] of areas) {
    const f = fresh.filter(p => p.area === area).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    if (f) return { pid: f.id, reason: `영역 균형: 아직 적게 풀어 본 영역(${AREA_LABEL[area] || area})` };
  }
  return null;
}

export function focusSession(content, cst, pst) {
  const items = []; const used = new Set();
  const dueQ = reviewQueue(content, pst).slice(0, 3);
  for (const d of dueQ) { items.push({ kind: 'problem', pid: d.pid, reason: '복습: ' + d.reasons.join(' · ') }); used.add(d.pid); }
  const rc = recommendConcept(content, cst, pst);
  if (rc) items.push({ kind: 'concept', cid: rc.concept.id, reason: rc.reason });
  const areaOrder = ['code', 'sql', 'theory'];
  for (let i = 0; items.length < 8 && i < 12; i++) {
    const area = areaOrder[i % 3];
    const fresh = content.problems.filter(p => p.area === area && !pst[p.id]?.level && !used.has(p.id) && p.status !== 'hidden');
    const linked = rc ? fresh.find(p => (p.concepts || []).includes(rc.concept.id)) : null;
    const f = linked || fresh[0];
    if (f) { items.push({ kind: 'problem', pid: f.id, reason: linked ? '추천 개념과 연결된 새 문제' : `새 문제 · ${AREA_LABEL[area]}` }); used.add(f.id); }
  }
  return items;
}

export const AREA_LABEL = { code: '코드(C·Java·Python)', sql: 'SQL', theory: '이론' };
export const CAUSES = ['개념 부족', '개념 혼동', '계산·추적 실수', '조건 누락', '표기·형식 실수', '시간 부족·찍음'];
