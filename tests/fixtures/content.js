// 직접 작성한 UI 점검용 데이터. 실제 학습 자료를 공개 저장소에 넣지 않는다.
export const fixtureContent = {
  version: 'ui-check', files: [{ id: 'F01', title: '테스트 원본', path: '테스트 원본.pdf', storage: 'originals/F01.pdf', pages: 1, analysis: 'done' }],
  toc: [{ id: 'unit', title: '프로그래밍', area: 'code', concepts: ['array', 'loop'] }, { id: 'db', title: '데이터베이스', area: 'theory', concepts: ['model'] }],
  concepts: [
    { id: 'array', title: '배열', area: 'code', order: 1, summary: '**배열**은 여러 값을 순서대로 저장합니다.', definition: '같은 자료형의 값을 **인덱스**로 접근하는 자료구조입니다. 인덱스는 각 값의 위치를 나타냅니다.\n\n각 원소는 자신의 위치로 구분합니다.', mnemonic: '배열은 순서, 인덱스는 위치로 기억하세요.', keywords: ['배열', '인덱스', '자료형'], easy: '물건을 순서대로 둔 상자를 생각해 보세요. 인덱스는 상자의 위치입니다.', examples: [{ title: '첫 번째 값', code: 'values = [10, 20]\nprint(values[0])', lang: 'python', output: '10', explain: '첫 인덱스는 0입니다.' }], sources: [{ file: 'F01', pdf_page: 1, role: 'basis' }], gamja: [{ label: '5) 배열', file: 'F23', pages: [9], images: [{ path: 'crops/G23-c-array-1.png', page: 9, w: 789, h: 1946 }] }, { label: '9) 문자열', file: 'F23', pages: [11, 12], images: [{ path: 'crops/G23-c-str-1.png', page: 11, w: 790, h: 700 }] }], checks: [], verification: [{ type: '추가 확인 필요', detail: '테스트 원본.pdf' }] },
    { id: 'loop', title: '반복문', area: 'code', order: 2, summary: '조건에 따라 같은 처리를 반복합니다.', studyPriority: { topics: [{ title: '반복 조건(화면 점검용 중요도)', level: 'essential', pdf_page: 1 }], source: { file: 'F01', legend_page: 1, version: '화면 점검용 예시' } }, checks: [], verification: [] },
    { id: 'model', title: '데이터 모델', area: 'theory', order: 3, summary: '데이터를 표현하는 방법을 살펴봅니다.', definition: '- **데이터 모델 구성 3요소**: 구조(Structure), 연산(Operation), 제약조건(Constraint).\n- 구성 요소를 구분해서 기억하세요.', keywords: ['데이터 모델 구성 3요소'], memoryTerms: ['구조(Structure)', '연산(Operation)', '제약조건(Constraint)'], studyPriority: { topics: [{ title: '관계 모델(화면 점검용)', level: 'core' }, { title: '스키마(화면 점검용)', level: 'supplement' }] }, checks: [], verification: [] },
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
