import type { AgoraHomeResponse } from '@tome/shared';
import { Link } from 'react-router';
import { topicTiles } from './agora';
import { AgoraImage } from './AgoraImage';

/**
 * 핫토픽 묶음: 표지 4장(2×2)과 아래 주제 제목. 누르면 그 핫토픽 화면으로 간다.
 * 시안의 "+N"(주제의 나머지 공개 프로젝트 수)은 홈 응답이 주제당 일부만 주고 전체 수가 없어 표시하지 않는다.
 */
export function TopicBundle({ entry }: { entry: AgoraHomeResponse['hotTopics'][number] }) {
  const tiles = topicTiles(entry.projects);
  return (
    <Link
      to={`/agora/topics/${encodeURIComponent(entry.topic.id)}`}
      className="flex w-[var(--size-agora-topic-width)] flex-col gap-[var(--space-padding-5)]"
    >
      <span className="relative grid h-[var(--size-agora-topic-height)] grid-cols-2 grid-rows-2 gap-[var(--space-agora-tile-gap)] overflow-hidden rounded-[var(--radius-agora-card)]">
        {tiles.covers.map((cover, index) => (
          <span key={index} className="relative">
            <AgoraImage path={cover} />
          </span>
        ))}
      </span>
      <span className="[font:var(--text-subtitle-st1-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
        {entry.topic.title}
      </span>
    </Link>
  );
}
