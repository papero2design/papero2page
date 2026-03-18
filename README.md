1. local 실행

`O2DESIGN` 폴더 내부에서 터미널 접속, 아래 명령어 실행

```bash
npm run dev
```

`http://localhost:3000`에서 실행됨

2. 폴더 구조

```
src/
├── app/                  # 화면(페이지)과 라우팅을 담당하는 곳
│   ├── (auth)/           # 괄호()는 URL 주소에는 안 나오지만 폴더만 묶어주는 기능
│   │   └── login/        # 로그인 페이지 (localhost:3000/login)
│   ├── (classic)/      # 대시보드 공통 레이아웃(사이드바 등)이 적용될 페이지들
│   │   ├── board/        # 메인 작업 리스트 페이지
│   │       ├── statistics/   # 통계 및 캘린더 페이지 (관리자용)
│   │       └── designers/    # 디자이너 관리 페이지 (관리자용)
│   ├── layout.tsx        # 앱 전체의 최상위 뼈대 (여기에 테마를 씌울 거야)
│   ├── page.tsx          # 첫 접속 페이지 (로그인 여부에 따라 리다이렉트 처리)
│   └── globals.css       # 전역 CSS (폰트 포함)
│
├── components/           # 재사용 가능한 UI 블록들
│   ├── layout/           # Header.tsx, Sidebar.tsx 등
│   ├── tasks/            # TaskCard.tsx, TaskForm.tsx (작업 관련 컴포넌트)
│   └── common/           # 공통으로 쓰는 모달, 뱃지 등
│
├── lib/                  # 설정 파일이나 유틸리티 함수들
│   ├── supabase/         # supabaseClient.ts (DB 연결 세팅)
│   ├── theme/            # theme.ts (MUI 테마 세팅)
│   └── utils/            # formatDate.ts 같은 공통 함수들
│
└── types/                # 타입스크립트 타입 정의 모음
    └── database.ts       # Task, Designer 등의 타입
```
