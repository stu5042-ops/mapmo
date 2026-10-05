# 메모맵 — Cloudflare Workers + D1 + R2

외부 호스팅 서비스에 묶이지 않고 직접 운영할 수 있도록 정리한 메모맵입니다.
화면과 주요 기능은 원본 프로젝트를 유지하고, 데이터와 파일 저장만 Cloudflare로 옮겼습니다.

## 구성

- Cloudflare Workers: SSR + API
- Cloudflare D1: 회원, 메모, 좋아요, 댓글, 친구, 메시지
- Cloudflare R2: 메모/프로필 사진
- Leaflet + OpenStreetMap: 지도
- Nominatim: 장소 검색/주소 변환
- Deezer API: 노래 검색 + 미리듣기

## GitHub → Cloudflare 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Cloudflare에서 D1 데이터베이스를 `memomap-db` 이름으로 생성합니다.
3. 생성된 D1의 ID를 `wrangler.jsonc`의 `database_id`에 넣습니다.
4. R2 버킷을 `memomap-media` 이름으로 생성합니다.
5. 터미널에서 Wrangler 로그인을 하고 DB migration과 배포를 실행합니다.

```bash
npm install
npx wrangler login
npm run db:migrate
npm run deploy
```

Cloudflare 대시보드의 Workers Builds로 GitHub 저장소를 연결해도 됩니다. 이 경우에도 D1/R2 binding은 `wrangler.jsonc`와 Cloudflare 리소스가 일치해야 합니다.

## 로컬 개발

```bash
npm install
npm run dev
```

D1 로컬 DB를 쓰려면:

```bash
npm run db:migrate:local
```

## 수정할 때 찾으면 되는 파일

- `src/routes/index.tsx`: 메인 지도 화면/패널 연결
- `src/routes/auth.tsx`: 로그인/회원가입
- `src/components/MapView.tsx`: 지도 동작
- `src/components/memo.tsx`: 메모 작성/상세/목록
- `src/components/social.tsx`: 친구/메시지/프로필
- `src/components/common.tsx`: 아바타/음악 UI
- `src/lib/app.tsx`: 인증, API, 데이터 타입, 음악 재생
- `src/server-api.ts`: D1/R2/권한/인증 서버 로직
- `migrations/0001_initial.sql`: D1 데이터베이스 구조

`src/routeTree.gen.ts`, `src/router.tsx`는 TanStack Start 라우팅 구성을 담당하므로 일반 기능 수정에서는 건드리지 않는 편이 좋습니다.

## GitHub 자동 배포

Cloudflare Workers Builds에서 이 GitHub 저장소를 연결할 수도 있습니다. 빌드 명령은 `npm run build`, 배포 명령은 `npx wrangler deploy`를 사용하고, 저장소의 `wrangler.jsonc`가 D1/R2 binding을 가리키도록 유지하세요.
