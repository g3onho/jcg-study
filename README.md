# jcg-study — 정보처리기사 실기 개인 학습 웹앱 (앱 코드)

개인용 학습 웹앱의 **화면 코드만** 들어 있는 저장소입니다.

- 학습 콘텐츠(문제·해설·개념), 원본 PDF, 학습 기록은 이 저장소에 없습니다. 로그인한 허용 사용자만 Supabase 비공개 저장소·DB에서 받아옵니다.
- 공개된 값은 Supabase 프로젝트 URL과 브라우저용 publishable 키뿐이며, 실제 접근 권한은 DB 행 단위 보안(RLS)과 Storage 정책(`supabase/schema.sql`)이 결정합니다. 신규 회원가입은 꺼져 있습니다.
- 앱 사용 중 AI API를 호출하지 않습니다. 채점·추천은 미리 검토한 허용 답안과 단순 규칙으로 동작합니다.

## 구성
- Preact + Vite, `@supabase/supabase-js`, `pdfjs-dist`(원본 PDF 쪽 이동 보기), `marked`
- `src/store.js`: 추가 전용 이벤트 기록(클라이언트 UUID로 중복 제출 방지), 버전 기반 키-값 상태(`kv_put`)로 기기 간 충돌 감지, 오프라인 시 기기 내 대기열 보관 후 재전송
- `src/engine.js`: 복습 간격·추천 규칙
- `src/grading.js`: 허용 답안 기반 결정적 채점

## 배포
`main`에 푸시하면 GitHub Actions가 빌드해 GitHub Pages에 배포합니다.
