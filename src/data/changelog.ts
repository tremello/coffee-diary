// One entry per Vercel release, newest first. Add an entry here with every deploy to main so 설정 > 정보 shows what changed.
export type Release = { version: string; date: string; changes: string[] };

export const RELEASES: Release[] = [
  { version: "1.9", date: "2026-10-27", changes: ["오른쪽 위 ☰ 버튼에서 여는 설정 화면", "테마·기본 원두 목록 보기·처음 열 탭·통계 기본 기간 설정", "드리퍼·숨긴 로스터리·품종·원산지 관리", "기록 내보내기(JSON·CSV)와 지운 원두 휴지통"] },
  { version: "1.8", date: "2026-10-27", changes: ["레시피 정렬", "브루잉 기록 검색 개선"] },
  { version: "1.7", date: "2026-10-26", changes: ["브루잉에 드리퍼·분쇄도·물 온도·추출 시간·맛 점수 기록", "원두 카드를 밀어서 바로 브루잉 기록", "침출형(스위치) 레시피", "두 기기에서 동시에 저장해도 기록이 덮어써지지 않게"] },
  { version: "1.6", date: "2026-10-25", changes: ["원두 메모를 '내 메모'로 정리"] },
  { version: "1.5", date: "2026-10-24", changes: ["로스터리 라벨 느낌의 새 디자인", "다크 모드", "휴대폰 떠 있는 추가 버튼과 항상 보이는 원두 검색", "다른 기기의 수정 내용 합치기"] },
  { version: "1.4", date: "2026-10-23", changes: ["원두 봉투 사진으로 정보 자동 입력", "가격·로스팅일 범위 검색"] },
  { version: "1.3", date: "2026-10-22", changes: ["나의 레시피", "탭마다 주소(#beans 등)"] },
  { version: "1.2", date: "2026-10-21", changes: ["재고 요약과 간략 보기 도넛"] },
  { version: "1.1", date: "2026-10-20", changes: ["원두 가격·등급과 단가 정렬", "테이스팅 노트를 브루잉 기록에 합침"] },
  { version: "1.0", date: "2026-05-06", changes: ["첫 버전"] },
];
