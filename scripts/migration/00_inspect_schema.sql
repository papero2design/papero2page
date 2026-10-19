-- ================================================================
-- 00_inspect_schema.sql — 스키마 점검용 (읽기 전용)
-- Supabase Dashboard → SQL Editor 에서 구 / 신 프로젝트 각각 실행해 결과를 비교하세요.
-- migrate.mjs inspect 가 같은 일을 자동으로 하지만, DB 접속 문자열 없이
-- 대시보드만으로 확인하고 싶을 때 씁니다.
-- ================================================================

-- 1) public 테이블과 행 수
select c.relname as table_name, c.reltuples::bigint as approx_rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2) 앱이 쓰는 테이블의 컬럼 (양쪽 결과를 나란히 두고 비교)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','designers','app_settings','tasks','task_files','task_logs',
                     'chat_rooms','chat_room_members','chat_messages','outsourcing_messages',
                     'staff_contacts','designer_contacts','notification_outbox')
order by table_name, ordinal_position;

-- 3) 신 DB 에 반드시 있어야 하는 RPC 함수 (paperO2-main 코드가 호출)
select routine_name, data_type as returns
from information_schema.routines
where routine_schema = 'public' and routine_name in ('is_staff','can_settle');

-- 4) CHECK 제약 (role / member_type / status 허용값 확인)
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c' and connamespace = 'public'::regnamespace
order by 1, 2;

-- 5) Realtime 발행 대상 (신 DB: tasks, chat_messages, outsourcing_messages 가 있어야 실시간 갱신 동작)
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by 2;

-- 6) 계정 수 / 이메일
select count(*) as users, count(email) as with_email from auth.users;
select id, email, created_at from auth.users order by created_at;

-- 7) task_number 범위 (충돌 예상 확인)
select min(task_number), max(task_number), count(*) from public.tasks;
