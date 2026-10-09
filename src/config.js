// 공개되어도 되는 값만 둔다. (anon/publishable 키는 공개용이며, 실제 권한은 DB의 행 단위 보안(RLS)과 Storage 정책이 결정한다.)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const BUCKET = 'private';
// 사용자가 지정한 목표 시험일(역사적 설정값). 날짜가 지나도 자동으로 바꾸지 않는다.
export const EXAM_DATE = '2026-10-25';
export const EXAM_LABEL = '2026년 정보처리기사 실기 3회 (사용자 지정일)';
export const APP_VERSION = '1.0.0';
