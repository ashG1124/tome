/** 스토리 챕터 세 개가 공통으로 받는 값 */
export interface ChapterProps {
  /** true 면 스크롤 연출(pin·타임라인), false 면 정지 화면(움직임 줄이기·?motion=off·느린 PC) */
  motion: boolean;
}
