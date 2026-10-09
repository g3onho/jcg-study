import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { studentContent } from '../src/content-access.js';

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input).toLowerCase() === resolve(output).toLowerCase()) throw new Error('사용법: node scripts/prepare-student.mjs <원본 번들> <새 사용자용 파일>');
const source = JSON.parse(await readFile(input, 'utf8'));
const result = studentContent(source);
for (let i = 0; i < source.problems.length; i++) {
  assert.deepEqual(result.problems[i].grading, source.problems[i].grading, source.problems[i].id + ': 채점 기준 변경 금지');
  assert.equal(result.problems[i].code, source.problems[i].code);
  assert.equal(result.problems[i].answer_display, source.problems[i].answer_display);
}
for (let i = 0; i < source.concepts.length; i++) for (let j = 0; j < (source.concepts[i].checks || []).length; j++) assert.deepEqual(result.concepts[i].checks[j].grading, source.concepts[i].checks[j].grading);
await writeFile(output, JSON.stringify(result), 'utf8');
console.log(`사용자용 콘텐츠 생성 및 채점 보존 확인: 문제 ${result.problems.length}, 개념 ${result.concepts.length}`);
