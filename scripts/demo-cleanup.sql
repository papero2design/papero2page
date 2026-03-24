-- ================================================================
-- 샘플 데이터 삭제
-- demo-seed.sql 실행 후 정리할 때 사용
-- ================================================================

BEGIN;

-- tasks 삭제 (designer ID로 필터링)
DELETE FROM tasks
WHERE assigned_designer_id IN (
  SELECT id FROM designers WHERE id LIKE 'd1de0000-%'
);

-- 미배정 더미 tasks 삭제 (registered_by로 구분이 어려우므로 생성 시각 기준)
-- 주의: 실제 데이터와 겹치지 않게 seed에서 created_at을 명시했음
DELETE FROM tasks
WHERE registered_by = '관리자'
  AND created_at <= NOW()
  AND id NOT IN (SELECT id FROM tasks WHERE assigned_designer_id NOT IN (
    SELECT id FROM designers WHERE id LIKE 'd1de0000-%'
  ) AND assigned_designer_id IS NOT NULL);

-- designers 삭제
DELETE FROM designers WHERE id LIKE 'd1de0000-%';

-- task_logs 삭제 (고아 레코드)
DELETE FROM task_logs
WHERE task_id NOT IN (SELECT id FROM tasks);

COMMIT;
