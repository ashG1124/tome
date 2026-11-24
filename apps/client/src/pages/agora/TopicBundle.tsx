import type { AgoraHomeResponse } from '@tome/shared';
import { Link } from 'react-router';
import { COPY } from '../../shared/copy';
import { formatCount, topicExtraCount, topicTiles, TOPIC_TILE_COUNT } from './agora';
import { AgoraImage } from './AgoraImage';

/** 칸 사이의 흰 구분선: 각 칸 안쪽 가장자리 1px(Figma 5170:135879) → 가운데에 흰 십자선 */
const CELL_EDGES = [
  'border-r border-b',
  'border-l border-b',
  'border-r border-t',
  'border-l border-t',
] as const;

/**
 * 핫토픽 묶음(Topic Card 5170:135878): 표지 4장(2×2) 콜라주와 아래 주제 제목(18 SemiBold, 간격 12). 누르면 그 핫토픽 화면으로 간다.
 * 콜라주 오른쪽 아래 "+N"(Topic Count 5170:135885)은 묶음에 보이는 4장 밖에 남은 이 주제의 공개 프로젝트 수(projectCount 기준)다.
 * 숫자는 낭독기에 링크 이름 "제목, N more projects"(AT-02)로 읽히고, 눈에 보이는 "+N"은 숨긴다.
 */
export function TopicBundle({ entry }: { entry: AgoraHomeResponse['hotTopics'][number] }) {
  const tiles = topicTiles(entry.projects);
  const extra = topicExtraCount(entry);
  return (
    <Link
      to={`/agora/topics/${encodeURIComponent(entry.topic.id)}`}
      // 이름은 보이는 제목으로 시작하고 "+N" 을 문장으로 덧붙인다(브라우저마다 숨은 글자 사이 띄어쓰기가 달라 aria-label 로 정한다)
      aria-label={
        extra > 0
          ? `${entry.topic.title}, ${COPY['AT-02'].replace('{count}', formatCount(extra))}`
          : undefined
      }
      className="flex w-[var(--size-agora-topic-width)] flex-col gap-[var(--space-gap-4)]"
    >
      <span className="relative grid h-[var(--size-agora-topic-height)] grid-cols-2 grid-rows-2 overflow-hidden rounded-[var(--radius-agora-card)] bg-[color:var(--color-fill-neutral-weak)]">
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
        {extra > 0 ? (
          <span
            aria-hidden="true"
            data-topic-count=""
            className={[
              'absolute right-[var(--space-agora-topic-count-right)] bottom-[var(--space-padding-5)] rounded-[var(--radius-max)]',
              'bg-[color:var(--color-agora-topic-count-fill)] backdrop-blur-[var(--blur-agora-topic-count)]',
              'px-[var(--space-padding-3)] py-[var(--space-agora-topic-count-y)]',
              '[font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] whitespace-nowrap text-[color:var(--color-font-on-fill)]',
            ].join(' ')}
          >
            +{formatCount(extra)}
          </span>
        ) : null}
      </span>
      <span className="[font:var(--text-subtitle-st2-sb)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
        {entry.topic.title}
      </span>
    </Link>
  );
}
