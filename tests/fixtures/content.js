// 직접 작성한 UI 점검용 데이터. 실제 학습 자료를 공개 저장소에 넣지 않는다.
export const fixtureContent = {
  version: 'ui-check', files: [{ id: 'F01', title: '테스트 원본', path: '테스트 원본.pdf', storage: 'originals/F01.pdf', pages: 1, analysis: 'done' }],
  toc: [{ id: 'unit', title: '프로그래밍', area: 'code', concepts: ['array', 'loop'] }],
  concepts: [
    { id: 'array', title: '배열', area: 'code', order: 1, summary: '여러 값을 순서대로 저장합니다.', definition: '같은 자료형의 값을 인덱스로 접근하는 자료구조입니다.', sources: [{ file: 'F01', pdf_page: 1, role: 'basis' }], checks: [], verification: [{ type: '추가 확인 필요', detail: '테스트 원본.pdf' }] },
    { id: 'loop', title: '반복문', area: 'code', order: 2, summary: '조건에 따라 같은 처리를 반복합니다.', checks: [], verification: [] },
  ],
  sets: [{ id: 'demo', title: '연습 문제', count: 3 }],
  problems: [1, 2, 3].map(n => ({
    // 첫 문항의 restored는 태그 표시 점검용 분류이며 실제 기출 자료가 아니다.
    id: 'demo-' + n, set: 'demo', setTitle: '화면 점검용 예시', no: n, title: n < 3 ? '배열 값 확인' : '반복문 확인', area: 'code', lang: 'python', origin: n === 1 ? 'restored' : 'authored',
    prompt: '다음 코드의 출력 결과를 쓰세요.', code: n < 3 ? `values = [10, 20]\nprint(values[${n - 1}])` : 'for i in range(1):\n    print(i)',
    concepts: [n < 3 ? 'array' : 'loop'], answer_display: n === 1 ? '10' : n === 2 ? '20' : '0',
    grading: { mode: 'output', output: { accept: [n === 1 ? '10' : n === 2 ? '20' : '0'], ws: 'line' } },
    explanation: { summary: '인덱스 위치의 값을 출력합니다.', steps: ['0부터 위치를 셉니다.'] },
    sources: [{ file: 'F01', pdf_page: 1, role: 'question' }], verification: [], hints: ['첫 위치의 인덱스는 0입니다.'],
  })), conflicts: [], coverage: [], terms: [],
};
