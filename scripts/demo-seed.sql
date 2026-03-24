-- ================================================================
-- 샘플 데이터
-- Supabase SQL Editor에서 실행
-- 삭제 시: DELETE FROM tasks WHERE special_details = '__DEMO__';
--           DELETE FROM designers WHERE id LIKE 'd1de0000-%';
-- ================================================================

BEGIN;

-- ── 디자이너 5명 ──────────────────────────────────────────────
INSERT INTO designers (id, name, status, is_active, user_id, email, banner_color) VALUES
  ('d1de0000-0000-0000-0000-000000000001', '김지우', '작업중', true, null, null, '2'),
  ('d1de0000-0000-0000-0000-000000000002', '이수아', '바쁨',   true, null, null, '0'),
  ('d1de0000-0000-0000-0000-000000000003', '박민준', '작업중', true, null, null, '5'),
  ('d1de0000-0000-0000-0000-000000000004', '최서연', '외출',   true, null, null, '7'),
  ('d1de0000-0000-0000-0000-000000000005', '정하은', '연차',   true, null, null, '3');

-- ── 우선작업 탭 (is_priority=true, assigned=null) ────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, special_details, created_at) VALUES
  ('홈페이지', '김민지', '신규 디자인',       '명함',       '없음',   '게시판', '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '1 day'),
  ('스토어팜', '이준혁', '샘플디자인 의뢰',   '전단지',     '단면박', '메일',   '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('홈페이지', '박서윤', '재주문(글자수정)',  '롤업배너',   '없음',   '게시판', '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '3 hours'),
  ('홈페이지', '최유진', '디자인 수정',       '현수막',     '없음',   '메일',   '작업중', true, true,  '관리자', '__DEMO__', NOW() - INTERVAL '5 hours'),
  ('스토어팜', '정다은', '신규 디자인',       '봉투',       '없음',   '게시판', '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '4 days'),
  ('홈페이지', '강민수', '재주문(수정X)',     '스티커',     '없음',   '게시판', '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '6 hours'),
  ('홈페이지', '조하늘', '디자인 복원',       '팸플릿',     '양면박', '메일',   '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('스토어팜', '윤서진', '신규 디자인',       '카탈로그',   '없음',   '게시판', '작업중', true, false, '관리자', '__DEMO__', NOW() - INTERVAL '1 day');

-- ── 작업등록 탭 (is_priority=false, assigned=null) ───────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, special_details, created_at) VALUES
  ('홈페이지', '장예원', '신규 디자인',       '포스터',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '1 day'),
  ('스토어팜', '임재민', '인쇄만',           '명함',       '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '3 days'),
  ('홈페이지', '한소희', '재주문(글자수정)',  '전단지',     '단면박', '메일',   '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('홈페이지', '오지호', '디자인 수정',       '리플렛',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '5 days'),
  ('스토어팜', '신예은', '신규 디자인',       '쇼핑백',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '4 days'),
  ('홈페이지', '권도윤', '샘플디자인 의뢰',  '레터헤드',   '없음',   '메일',   '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '6 days'),
  ('홈페이지', '황지민', '기타',             '패키지',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '1 day'),
  ('스토어팜', '문선영', '재주문(수정X)',     '스티커',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '7 days'),
  ('홈페이지', '류성민', '신규 디자인',       '현수막',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('홈페이지', '서지아', '인쇄만',           '명함',       '없음',   '메일',   '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '3 days');

-- ── 김지우 배정 ───────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, created_at) VALUES
  ('홈페이지', '나은지', '신규 디자인',       '브로셔',     '없음',   '게시판', '작업중', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '1 day'),
  ('스토어팜', '배준서', '재주문(글자수정)',  '명함',       '없음',   '게시판', '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '3 days'),
  ('홈페이지', '이하린', '디자인 수정',       '전단지',     '단면박', '메일',   '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '2 days');

-- ── 이수아 배정 ───────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, created_at) VALUES
  ('홈페이지', '김태양', '신규 디자인',       '포스터',     '없음',   '게시판', '작업중', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '1 day'),
  ('스토어팜', '박나래', '인쇄만',           '명함',       '없음',   '게시판', '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('홈페이지', '최민호', '샘플디자인 의뢰',  '롤업배너',   '없음',   '메일',   '작업중', false, true,  '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '4 days');

-- ── 박민준 배정 ───────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, created_at) VALUES
  ('홈페이지', '정수현', '재주문(수정X)',     '현수막',     '없음',   '게시판', '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000003', '__DEMO__', NOW() - INTERVAL '2 days'),
  ('스토어팜', '강유진', '신규 디자인',       '스티커',     '없음',   '게시판', '작업중', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000003', '__DEMO__', NOW() - INTERVAL '1 day');

-- ── 최서연 배정 ───────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, created_at) VALUES
  ('홈페이지', '유재석', '신규 디자인',       '리플렛',     '없음',   '게시판', '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000004', '__DEMO__', NOW() - INTERVAL '2 days');

-- ── 정하은 배정 ───────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, created_at) VALUES
  ('스토어팜', '박명수', '디자인 수정',       '팸플릿',     '양면박', '게시판', '작업중', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000005', '__DEMO__', NOW() - INTERVAL '1 day');

-- ── 작업완료 탭 ────────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, assigned_designer_id, special_details, completed_at, created_at) VALUES
  ('홈페이지', '심재원', '신규 디자인',       '명함',       '없음',   '게시판', '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '1 day',  NOW() - INTERVAL '4 days'),
  ('스토어팜', '노지수', '재주문(글자수정)',  '전단지',     '단면박', '메일',   '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '6 days'),
  ('홈페이지', '모지아', '인쇄만',           '명함',       '없음',   '게시판', '완료', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000003', '__DEMO__', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '8 days'),
  ('스토어팜', '엄기준', '디자인 수정',       '롤업배너',   '없음',   '게시판', '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '4 days',  NOW() - INTERVAL '9 days'),
  ('홈페이지', '변소은', '신규 디자인',       '포스터',     '없음',   '메일',   '완료', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '5 days',  NOW() - INTERVAL '10 days'),
  ('홈페이지', '표인봉', '재주문(수정X)',     '봉투',       '없음',   '게시판', '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000004', '__DEMO__', NOW() - INTERVAL '6 days',  NOW() - INTERVAL '12 days'),
  ('스토어팜', '탁재훈', '샘플디자인 의뢰',  '카탈로그',   '양면박', '게시판', '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000005', '__DEMO__', NOW() - INTERVAL '7 days',  NOW() - INTERVAL '14 days'),
  ('홈페이지', '허경환', '신규 디자인',       '현수막',     '없음',   '게시판', '완료', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000003', '__DEMO__', NOW() - INTERVAL '2 days',  NOW() - INTERVAL '5 days'),
  ('홈페이지', '채정안', '인쇄만',           '스티커',     '없음',   '메일',   '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000001', '__DEMO__', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '3 days'),
  ('스토어팜', '황정민', '디자인 수정',       '팸플릿',     '없음',   '게시판', '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000002', '__DEMO__', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '15 days'),
  ('홈페이지', '이병헌', '신규 디자인',       '리플렛',     '단면박', '게시판', '완료', true,  false, '관리자', 'd1de0000-0000-0000-0000-000000000003', '__DEMO__', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '7 days'),
  ('스토어팜', '전지현', '재주문(글자수정)',  '명함',       '없음',   '메일',   '완료', false, false, '관리자', 'd1de0000-0000-0000-0000-000000000004', '__DEMO__', NOW() - INTERVAL '9 days',  NOW() - INTERVAL '16 days');

-- ── 휴지통 ────────────────────────────────────────────────────
INSERT INTO tasks (order_source, customer_name, order_method, print_items, post_processing, consult_path, status, is_priority, is_quick, registered_by, special_details, deleted_at, created_at) VALUES
  ('홈페이지', '이세돌', '기타',             '포스터',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 days'),
  ('스토어팜', '박찬호', '신규 디자인',       '현수막',     '없음',   '게시판', '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '2 days', NOW() - INTERVAL '6 days'),
  ('홈페이지', '김연아', '재주문(글자수정)',  '전단지',     '단면박', '메일',   '작업중', false, false, '관리자', '__DEMO__', NOW() - INTERVAL '3 days', NOW() - INTERVAL '8 days');

COMMIT;
