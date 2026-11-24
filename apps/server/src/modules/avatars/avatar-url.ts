/**
 * 창작자 프로필 이미지 경로. 이미지가 없으면 null.
 * 답변 이미지(/assets/answers/:id/:variant)처럼 Bearer 인증 뒤에서 서명 URL 로 넘긴다(302).
 */
export const creatorAvatarUrl = (creator: {
  id: string;
  avatarKey: string | null;
}): string | null => (creator.avatarKey ? `/assets/creators/${creator.id}/avatar` : null);
