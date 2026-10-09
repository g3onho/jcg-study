import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudyPriority } from '../src/study-priority.js';

test('자료의 명시된 중요도를 쓰고 수록 기출 횟수나 core로 추정하지 않는다', () => {
  assert.equal(getStudyPriority({ core: true, studyPriority: { topics: [{ title: '설계', level: 'later' }] } }), 'later');
  assert.equal(getStudyPriority({ studyPriority: { topics: [{ title: '응집도', level: 'core' }, { title: 'SOLID', level: 'supplement' }] } }), 'core');
  assert.equal(getStudyPriority({ core: true }), 'unrated');
  assert.equal(getStudyPriority({ studyPriority: { topics: [{ level: 'core' }, { level: 'essential' }] } }), 'essential');
  assert.equal(getStudyPriority({ studyPriority: { topics: [{ level: 'unknown' }] } }), 'unrated');
});
