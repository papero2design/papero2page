-- ================================================================
-- CS팀 추가 마이그레이션
-- Supabase SQL 에디터에서 실행하세요.
-- ================================================================

-- 1. designers 테이블에 member_type 컬럼 추가
--    'designer' = 디자이너 (기존)
--    'cs'       = CS팀 (신규)
ALTER TABLE designers
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'designer'
  CHECK (member_type IN ('designer', 'cs'));

-- 2. profiles 테이블 role CHECK constraint가 있다면 업데이트
--    (Supabase 기본 설정에서는 role이 TEXT 타입이므로 보통 불필요)
--    아래는 참고용 — 실제 constraint 이름은 다를 수 있음
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
--   CHECK (role IN ('admin', 'designer', 'cs'));

-- 확인 쿼리
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'designers' AND column_name = 'member_type';
