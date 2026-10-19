# 구 Supabase(papero2page) → 신 Supabase(paperO2) 데이터 병합

`paperO2-main` 을 메인으로 쓰고, `papero2page-main` 이 쓰던 Supabase 의 테이블 데이터를
중복 없이 신 프로젝트 DB로 가져오는 절차입니다.

## 두 스키마의 관계 (분석 결과)

| 구 DB 테이블 | 신 DB 상태 | 복사 방식 |
|---|---|---|
| `auth.users`, `auth.identities` | 동일 구조 | id 같으면 건너뜀, 이메일 같으면 신 계정으로 병합, 나머지 복사(비밀번호 해시 포함) |
| `profiles` | 동일 + role 에 `outsourcing` 추가 | 계정 매핑 후 복사 |
| `designers` | 동일 + `member_type` 에 `outsourcing` 추가 | id → email → user_id → 이름 순으로 같은 사람 탐지 후 병합 |
| `app_settings` | 동일 (신 쪽 key 가 더 많음) | key 충돌 시 신 값 유지 |
| `tasks` | 구 컬럼 전부 포함 + 외주/마감/인쇄접수 컬럼 추가 | 공통 컬럼만 복사, 새 컬럼은 DB 기본값. `task_number` 충돌 시 재발급 |
| `task_files` | 동일 + `file_role` 등 추가 | 공통 컬럼만 복사 |
| `task_logs` | 동일 | user_id 를 매핑된 계정으로 바꿔 복사 |
| (신 DB 전용) `chat_*`, `outsourcing_messages`, `staff_contacts`, `designer_contacts`, `notification_outbox`, RPC `is_staff`/`can_settle` | 구 DB 에 없음 | 건드리지 않음 |

구 DB 에만 있고 신 DB 에 없는 컬럼은 없습니다. 그래서 데이터 손실 없이 한 방향 복사가 가능합니다.
스크립트는 컬럼 목록을 실행 시점에 `information_schema` 에서 읽어 **양쪽에 모두 있는 컬럼만** 복사하므로,
신 DB 스키마가 조금 바뀌어도 그대로 동작합니다. 구 DB 에는 SELECT 만 합니다.

## 준비물

1. Node 22 (설치돼 있음) — 이 폴더에서 `npm install` 은 이미 실행됨 (`pg`, `dotenv`)
2. 두 프로젝트의 **DB 접속 문자열** (Dashboard → Connect → Session pooler URI)
   - 구: `design-task-dashboard` 로 추정 (3월 생성), 신: `design-task-dashboard-dev` 로 추정 (8월 생성).
     `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 에 들어 있는 ref 로 반드시 확인하세요.
3. 신 프로젝트 DB 백업 — Dashboard → Database → Backups 에서 최신 백업이 있는지 확인 (Pro 플랜) 또는
   `supabase db dump` 로 직접 백업. 스크립트는 단일 트랜잭션이라 실패하면 자동 롤백되지만, 성공 후 되돌리려면 백업이 필요합니다.

## 실행 순서

```bash
cd paperO2-main/scripts/migration
copy .env.migration.example .env.migration   # 값 채우기

node migrate.mjs inspect    # 1. 스키마·행 수 비교. "스키마 호환 문제 없음" 이 나와야 함
node migrate.mjs plan       # 2. 미리보기: 몇 건이 들어가고, 누가 병합되고, 어떤 번호가 바뀌는지
node migrate.mjs apply --yes  # 3. 적재 (구 DB 스냅샷을 backup/ 에 JSON 으로 남긴 뒤 실행)
node migrate.mjs verify     # 4. 행 수·무결성·시퀀스 검증
```

`plan` 출력에서 특히 볼 것:

- **이메일 병합 목록**: 같은 이메일이 양쪽에 있으면 신 계정이 남고, 그 사람의 구 작업 로그·디자이너 연결이 신 계정으로 옮겨집니다. 로그인 비밀번호는 신 프로젝트 것입니다.
- **디자이너 병합 목록**: 이름이 같다고 묶인 항목이 실제로 같은 사람인지 확인하세요. 아니라면 신 DB 에서 그 디자이너 이름을 잠시 바꾼 뒤 다시 `plan` 을 보면 됩니다.
- **task_number 재발급**: 신 DB 에 이미 같은 번호가 있을 때만 발생합니다. 신 DB 가 비어 있으면 0건입니다.

## 적재 후 할 일

1. **첨부파일(R2)**: `task_files.file_url`, `tasks.file_paths`, `designers.avatar_url` 은 URL 문자열만 복사됩니다.
   신 프로젝트가 같은 R2 버킷(`CLOUDFLARE_R2_PUBLIC_URL`)을 쓰면 그대로 열리고, 다른 버킷이면 `rclone` 등으로 객체를 옮겨야 합니다.
2. **`.env.local`** (`paperO2-main` 루트): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 를 신 프로젝트 값으로.
   추가로 신 코드가 요구하는 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_PF_ID`, `SOLAPI_SENDER`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `NOTIFY_STAFF_PHONES`, R2 4종, `NEXT_PUBLIC_SITE_URL`.
3. **Realtime**: `inspect` 가 보여주는 publication 에 `tasks`, `chat_messages`, `outsourcing_messages` 가 없으면
   Dashboard → Database → Publications → `supabase_realtime` 에서 켜 주세요.
4. `npm run dev` 로 띄운 뒤 구 계정으로 로그인해 게시판·완료·휴지통·통계가 구 데이터와 맞는지 확인.
5. 문제 없으면 구 프로젝트는 **Pause** 해 두고(삭제하지 말 것), 2주 정도 지나 삭제.

## 다시 실행해도 되나?

됩니다. 모든 INSERT 가 `ON CONFLICT DO NOTHING` 이라 이미 들어간 행은 건너뛰고, 그 사이 구 DB 에 새로 생긴 행만 추가됩니다.
단, `task_number` 재발급은 매번 새 번호를 받으므로 재실행 전에 `plan` 으로 재발급 건수가 0인지 보세요.

## 참고: 저장소의 `supabase/migrations/00000000000000_initial.sql`

이 파일은 **구 프로젝트의 스키마 덤프**입니다 (`config.toml` 의 `project_id = "papero2page"`).
신 코드가 쓰는 테이블(`chat_*`, `outsourcing_messages` 등)과 컬럼(`outsourcing_*`, `due_at` …)이 빠져 있어,
이 파일로 새 DB 를 만들면 신 앱이 동작하지 않습니다. 데이터 병합과는 무관하지만, Docker 를 켠 뒤
`supabase link --project-ref <신 ref>` → `supabase db dump -f supabase/migrations/<timestamp>_schema.sql` 로
신 프로젝트 기준으로 다시 뽑아 두는 것을 권합니다.
