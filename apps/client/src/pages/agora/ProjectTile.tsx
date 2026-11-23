import type { AgoraProjectCard } from '@tome/shared';
import { Link } from 'react-router';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { formatCount } from './agora';
import { AgoraImage } from './AgoraImage';
import { AuthorAvatar } from './AuthorAvatar';

interface ProjectTileProps {
  card: AgoraProjectCard;
  /** topic = 핫토픽 목록(좋아요·댓글 수), derivative = 상세 오른쪽 파생작(작성자 사진) */
  variant: 'topic' | 'derivative';
}

/**
 * 아고라 프로젝트 카드. 사진 아래쪽에 그늘을 깔고 흰 글자로 제목을 둔다. 카드 전체가 상세로 가는 링크다.
 * 좋아요는 누르는 기능이 없어 숫자만 보여 준다. 숫자는 "1.2k"처럼 줄이고, 화면 읽기 프로그램에는 이름과 함께 읽힌다.
 */
export function ProjectTile({ card, variant }: ProjectTileProps) {
  const height =
    variant === 'topic' ? 'aspect-[551/359]' : 'h-[var(--size-agora-derivative-height)]';
  return (
    <Link
      to={`/agora/projects/${encodeURIComponent(card.id)}`}
      className={`relative isolate block overflow-hidden rounded-[var(--radius-agora-card)] ${height}`}
    >
      <AgoraImage path={card.coverThumbUrl} className="-z-10" />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(to_top,var(--color-shelf-cover-shade),transparent)]"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-[var(--space-padding-3)] p-[var(--space-padding-8)] text-[color:var(--color-font-on-fill)]">
        {variant === 'derivative' ? (
          <AuthorAvatar creator={card.author} sizeClass="size-[var(--size-avatar-card)]" />
        ) : null}
        <span className="[font:var(--text-subtitle-st1-sb)] tracking-[var(--letter-spacing-default)]">
          {card.title}
        </span>
        {variant === 'topic' ? (
          <span className="flex items-center gap-[var(--space-gap-4)] [font:var(--text-body-b1-r)]">
            <span className="inline-flex items-center gap-[var(--space-gap-3)]">
              <Icon name="favorite-outline" size={20} />
              <span className="sr-only">{COPY['A-07']}</span>
              {formatCount(card.likeCount)}
            </span>
            <span className="inline-flex items-center gap-[var(--space-gap-3)]">
              <Icon name="comment" size={20} />
              <span className="sr-only">{COPY['A-02']}</span>
              {formatCount(card.commentCount)}
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
