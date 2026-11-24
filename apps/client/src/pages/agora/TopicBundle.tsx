import type { AgoraHomeResponse } from '@tome/shared';
import { Link } from 'react-router';
import { topicTiles, TOPIC_TILE_COUNT } from './agora';
import { AgoraImage } from './AgoraImage';

/** 칸 사이의 흰 구분선: 각 칸 안쪽 가장자리 1px(Figma 3100:129720) → 가운데에 흰 십자선 */
const CELL_EDGES = [
  'border-r border-b',
  'border-l border-b',
  'border-r border-t',
  'border-l border-t',
] as const;

/**
 * 핫토픽 묶음(Hot Topic 카드 3100:129720): 표지 4장(2×2) 콜라주와 아래 주제 제목. 누르면 그 핫토픽 화면으로 간다.
 * 시안의 "+N"(주제의 나머지 공개 프로젝트 수)은 홈 응답이 주제당 6개까지만 주고 전체 수가 없어 표시하지 않는다.
 */
export function TopicBundle({ entry }: { entry: AgoraHomeResponse['hotTopics'][number] }) {
  const tiles = topicTiles(entry.projects);
  return (
    <Link
      to={`/agora/topics/${encodeURIComponent(entry.topic.id)}`}
      className="flex w-[var(--size-agora-topic-width)] flex-col gap-[var(--space-gap-4)]"
    >
      <span className="grid h-[var(--size-agora-topic-height)] grid-cols-2 grid-rows-2 overflow-hidden rounded-[var(--radius-agora-card)] bg-[color:var(--color-fill-neutral-weak)]">
        {CELL_EDGES.slice(0, TOPIC_TILE_COUNT).map((edges, index) => {
          const cover = tiles.covers[index];
          return (
            <span
              key={index}
              className={`relative border-[color:var(--color-background-default)] ${edges}`}
            >
              {cover !== undefined ? <AgoraImage path={cover} /> : null}
            </span>
          );
        })}
      </span>
      <span className="[font:var(--text-subtitle-st2-sb)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
        {entry.topic.title}
      </span>
    </Link>
  );
}
