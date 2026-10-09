import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInk, addStroke, eraseIds, mergeInk } from '../src/ink.js';
import { getState, getKV, setKV, flush } from '../src/store.js';

const stroke = i => ({ i, l: 'p', k: 0, p: [10, 10, 20, 20] });

test('저장 응답을 기다리며 쓴 다음 획은 화면과 다음 서버 저장에 남는다', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = getState(); const original = { ...state };
  t.after(() => Object.assign(state, original));
  let complete; const sent = [];
  Object.assign(state, { session: { user: { id: 'sync-test' } }, kv: {}, kvPending: {}, outbox: [], conflicts: {}, api: {
    kvPut(key, value, expected) {
      sent.push({ value, expected });
      if (sent.length === 1) return new Promise(resolve => { complete = resolve; });
      return Promise.resolve({ ok: true, value, version: 2 });
    },
  } });
  const first = addStroke(emptyInk(), stroke('a'));
  setKV('ink:sync-test', first, 700);
  const saving = flush();
  const second = addStroke(getKV('ink:sync-test'), stroke('b'));
  setKV('ink:sync-test', second, 700);
  complete({ ok: true, value: first, version: 1 });
  await saving;
  assert.deepEqual(getKV('ink:sync-test').s.map(x => x.i), ['a', 'b']);
  assert.equal(state.kvPending['ink:sync-test'].expected, 1);
  const third = addStroke(getKV('ink:sync-test'), stroke('c'));
  setKV('ink:sync-test', third, 700);
  await flush();
  assert.deepEqual(sent[1].value.s.map(x => x.i), ['a', 'b', 'c']);
  assert.equal(sent[1].expected, 1);
  assert.equal(Object.keys(state.kvPending).length, 0);
});

test('서로 다른 기기의 획은 합치고 지운 획은 되살리지 않는다', () => {
  const shared = addStroke(emptyInk(), stroke('a'));
  const ipad = addStroke(eraseIds(shared, ['a']), stroke('b'));
  const pc = addStroke(shared, stroke('c'));
  const merged = mergeInk(ipad, pc);
  assert.deepEqual(merged.s.map(x => x.i), ['b', 'c']);
  assert.deepEqual(mergeInk(pc, ipad), merged);
  assert.deepEqual(mergeInk(merged, ipad), merged);
});
