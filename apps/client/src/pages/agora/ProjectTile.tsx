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
 * 아고라 프로젝트 카드. 사진 아래쪽에 그늘(0 → 70%)을 깔고 흰 글자로 제목을 둔다. 카드 전체가 상세로 가는 링크다.
 * topic: 550×359 비율, 왼쪽 25·아래 28 안쪽, 제목 22(폭 418 까지) + 간격 12 + 지표 줄(3099:130542).
 * derivative: 높이 213, 왼쪽 22·아래 23 안쪽, 사진 36 + 간격 6 + 제목 20(3099:130841).
 * 좋아요는 누르는 기능이 없어 숫자만 보여 준다. 숫자는 "1.2k"처럼 줄이고, 화면 읽기 프로그램에는 이름과 함께 읽힌다.
 */
export function ProjectTile({ card, variant }: ProjectTileProps) {
  const isTopic = variant === 'topic';
  const box = isTopic
    ? 'aspect-(--size-agora-topic-tile-ratio) pl-[var(--space-agora-topic-text-x)] pb-[var(--space-agora-topic-text-bottom)]'
    : 'h-[var(--size-agora-derivative-height)] pl-[var(--space-agora-derivative-text-x)] pb-[var(--space-agora-derivative-text-bottom)]';
  return (
    <Link
      to={`/agora/projects/${encodeURIComponent(card.id)}`}
      className={`relative isolate flex flex-col justify-end overflow-hidden rounded-[var(--radius-agora-card)] pr-[var(--space-agora-topic-text-x)] ${box}`}
    >
      <AgoraImage path={card.coverThumbUrl} className="-z-20" />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[image:var(--gradient-agora-card-shade)]"
      />
      <span
        className={`flex min-w-0 flex-col text-[color:var(--color-font-on-fill)] ${isTopic ? 'gap-[var(--space-gap-4)]' : 'gap-[var(--space-gap-2)]'}`}
      >
        {!isTopic ? (
          <AuthorAvatar creator={card.author} sizeClass="size-[var(--size-avatar-card)]" />
        ) : null}
        <span
          className={`truncate tracking-[var(--letter-spacing-heading-h1)] ${isTopic ? 'max-w-[var(--size-agora-topic-text-width)] [font:var(--text-heading-h2)]' : '[font:var(--text-subtitle-st1-sb)]'}`}
        >
          {card.title}
        </span>
        {isTopic ? (
          <span className="flex items-center gap-[var(--space-agora-metric-gap)] [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)]">
            <span className="inline-flex items-center gap-[var(--space-gap-3)]">
              <Icon name="favorite-outline" size={24} />
              <span className="sr-only">{COPY['A-07']}</span>
              {formatCount(card.likeCount)}
            </span>
            <span className="inline-flex items-center gap-[var(--space-gap-3)]">
              <Icon name="comment" size={24} />
              <span className="sr-only">{COPY['A-02']}</span>
              {formatCount(card.commentCount)}
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
