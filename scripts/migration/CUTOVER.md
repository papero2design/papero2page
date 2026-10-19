# 전환 당일 체크리스트 (구 papero2page → 신 paperO2)

작성: 2026-10-19 (로컬 Docker 리허설 + 롤백 검증 완료 기준)

- 구 Supabase: `design-task-dashboard` (cuczfmmaffrtzyctyptc)
- 신 Supabase: `design-task-dashboard-dev` (zbmqqsifphzwnlfwtckm)
- 접속 문자열: `scripts/migration/.env.migration` (OLD_DB_URL / NEW_DB_URL 이미 채워짐)
- 소요: 적재 약 5초, 전체 점검 포함 30분 내외

## 확정된 처리 방식

| 항목 | 방식 |
|---|---|
| 작업번호 충돌 | 구 작업이 새 번호를 받음 (실행 시점에 자동 계산, plan 에서 목록 확인) |
| 로그인 계정 | 전부 복사, 병합 없음 (이메일이 모두 다름). 비밀번호 그대로 사용 가능 |
| 디자이너 | 이름+구분이 같은 3명(송유지·김시은·송찬미)만 병합. 이동욱은 구분이 달라 두 행 유지 → 관리자가 추후 정리 |
| 테스트 계정 example1~9 | 그대로 가져옴 → 관리자가 추후 삭제 |
| app_settings | 신 값 유지 (디자이너 탭 순서는 전환 후 화면에서 재정렬) |
| 신 DB 전용 테이블 (chat, outsourcing 등) | 건드리지 않음 |

## 사전 준비 (전환 전날까지)

- [ ] 기존 Vercel 프로젝트에 paperO2-main 코드가 Preview 로 배포되어 빌드 통과 확인
- [ ] Vercel Production 환경변수 준비: 신 Supabase 3개(URL/ANON/SERVICE_ROLE) 교체 + solapi 4개 + NOTIFY_WEBHOOK_SECRET + NOTIFY_STAFF_PHONES + CRON_SECRET 추가. **`NOTIFY_DRY_RUN=0`** 을 넣어야 알림톡이 실제 발송됨 (없으면 dry-run). R2 4개는 양쪽 동일이라 그대로. `NEXT_PUBLIC_SITE_URL` 은 운영 도메인
- [ ] 신 Supabase → Authentication → URL Configuration 에 기존 서비스 도메인을 Site URL / Redirect URLs 에 추가
- [ ] 신 Supabase → Database → Backups 에서 최근 백업 시각 확인
- [ ] R2: 구/신 버킷이 다르면 첨부파일 객체 복사 (DB 에는 URL 만 복사됨)
- [ ] 사용자에게 점검 시간 안내. 번호가 #15,4xx 번대로 바뀐다는 것도 안내

## 당일 순서

```bash
cd C:\Users\admin\desktop\meagre\paperO2-main\scripts\migration
```

1. **구 사이트 입력 중단** (점검 안내 게시 또는 구 Vercel 프로젝트를 임시 비활성화)
2. 읽기 전용 점검
   ```bash
   node migrate.mjs inspect     # "스키마 호환 문제 없음" 확인
   node migrate.mjs plan        # 건수·병합 목록·번호 재발급 목록 확인
   ```
3. 적재
   ```bash
   node migrate.mjs apply --yes
   ```
   - `backup/old-snapshot-<시각>.json` 과 `backup/new-preexisting-<시각>.json` 두 파일이 생긴 것 확인 (롤백에 필요)
   - 실패 시 전부 자동 롤백됨. 메시지 확인 후 재실행 가능
4. 검증
   ```bash
   node migrate.mjs verify      # 구 작업 누락 0건, 무결성 ✓ 확인 ("프로필 없는 계정 9" 는 테스트 계정이라 정상)
   ```
5. Vercel 전환
   - 기존 Vercel 프로젝트 → Settings → Environment Variables 의 **Production** 값 교체 (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY → 신 값, 나머지 신규 변수 추가, NOTIFY_DRY_RUN=0)
   - GitHub papero2design/papero2page 에서 `papero2-merge` → `main` 병합 (PR 또는 아래 명령)
     ```bash
     cd C:Usersadmindesktopmeagrepapero2page-repo
     git checkout main && git pull && git merge --no-ff papero2-merge && git push origin main
     ```
   - Vercel 이 main 을 자동 배포 → 완료 대기 (환경변수 교체가 먼저여야 빌드에 신 값이 들어감)
6. 확인
   - 구 계정으로 로그인 → 게시판·완료·휴지통·통계 건수가 구 사이트와 맞는지
   - 신 계정으로 로그인 → 기존 신 데이터·채팅·외주 화면 정상
   - 작업 1건 생성 → 번호가 #15,4xx 번대인지
   - 첨부파일 열림 여부 (R2)
7. 마무리
   - 구 Supabase 프로젝트 **Pause** (삭제 금지, 2주 뒤 정리)
   - 구 Vercel 프로젝트 비활성화 또는 도메인 해제

## 문제 발생 시 롤백

```bash
node rollback.mjs plan          # 삭제될 행 수 확인 (쓰기 없음)
node rollback.mjs apply --yes   # 적재가 넣은 행만 삭제, 단일 트랜잭션
```
- Vercel 은 Deployments → 이전 배포 → **Instant Rollback**
- 전환 뒤 시간이 지나 신 사이트에서 구 작업에 로그·파일이 붙었다면 plan 에 경고로 표시되며, 작업 삭제 시 함께 사라진다. 그 경우 롤백 대신 개별 수정을 검토

## 리허설 환경 정리 (전환 끝난 뒤)

```bash
cd C:\Users\admin\desktop\meagre\paperO2-main
supabase stop                   # 로컬 Docker 스택 종료 (--no-backup 붙이면 볼륨도 삭제)
```
- `.env.local` 은 현재 **리허설용 로컬 키**이므로 운영 값으로 교체할 것
- `scripts/migration/rehearsal/` 와 `backup/` 의 리허설 산출물은 삭제해도 됨
