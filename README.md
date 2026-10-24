# Coffee Diary

원두 재고, 브루잉 기록, 컵 노트를 관리하는 개인용 커피 다이어리 앱입니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 열면 됩니다.

## 배포 방법

Vercel에 연결하면 GitHub에 수정 사항을 올릴 때마다 자동으로 다시 배포할 수 있습니다.

권장 설정:

- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

## 저장 방식

기록은 먼저 브라우저의 로컬 저장소에 저장됩니다. 로그인하지 않으면 같은 기기와 같은 브라우저에만 남습니다.

Google로 로그인하면 기록이 Supabase에 동기화되어, 같은 계정으로 로그인한 다른 기기에서도 불러올 수 있습니다.
