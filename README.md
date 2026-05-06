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

현재 기록은 브라우저의 로컬 저장소에 저장됩니다. 같은 기기와 같은 브라우저에서는 계속 남아 있지만, 휴대폰과 컴퓨터 사이에 자동 동기화되지는 않습니다.

기기 간 동기화가 필요하면 나중에 Supabase 같은 클라우드 저장소를 붙이면 됩니다.
