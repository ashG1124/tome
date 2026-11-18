import type { ProjectSummary } from '@tome/shared';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { COPY, type CopyKey } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import {
  formatEditedDate,
  shelfCardType,
  shelfTags,
  type ShelfCardType,
  type ShelfTag,
} from './shelf';
import { useApiImage } from '../../shared/api';

/** 카드 종류별 글리프 이름(브랜드 그림 파일) */
const TYPE_GLYPH: Record<ShelfCardType, string> = {
  'my-work': 'glyph-mywork',
  remix: 'glyph-remix',
  derive: 'glyph-derive',
};
const TYPE_LABEL: Record<ShelfCardType, CopyKey> = {
  'my-work': 'H-03a',
  remix: 'H-03b',
  derive: 'H-03c',
};
const TAG_LABEL: Record<ShelfTag, CopyKey> = { finished: 'H-02b', posted: 'H-02a' };

/** 표지 사진 상태. 사진이 다 뜨기 전(loading)과 실패(failed)는 사진 없는 카드 면으로 그린다. */
type CoverState = 'none' | 'loading' | 'shown' | 'failed';

interface ShelfCardProps {
  project: ProjectSummary;
  /** 맨 오른쪽 칸 쪽이면 왼쪽으로 넓어진다. */
  openToLeft: boolean;
  /** 키보드로 순서를 한 칸 앞(-1)·뒤(+1)로 옮긴다. */
  onMove: (step: -1 | 1) => void;
}

/**
 * 서가 카드 한 장(108×192). 마우스를 올리거나 키보드 포커스가 오면 넓어지며 종류·편집일이 보인다.
 * 표지 사진이 뜨면 글자를 흰색으로 바꾸고, 좁을 때는 제목을 투명하게 둔다(낭독기·Tab·클릭은 그대로).
 * 링크에는 제목만 넣어 화면 낭독기가 제목으로 읽게 하고, Alt+←/→ 로 순서를 바꾼다(드래그의 키보드 대체).
 */
export function ShelfCard({ project, openToLeft, onMove }: ShelfCardProps) {
  const type = shelfCardType(project);
  const tags = shelfTags(project);
  const path = project.coverThumbUrl;
  // 표지 주소는 로그인 토큰이 있어야 받을 수 있어서, 그림 요소에 바로 넣지 않고 따로 받아 온다.
  const imageRef = useRef<HTMLImageElement>(null);
  const image = useApiImage(path, imageRef);
  // 주소별로 기억해서, 목록을 다시 받아 주소가 바뀌면 새 사진을 처음부터 다시 띄운다.
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const cover: CoverState =
    path === null
      ? 'none'
      : image.failed || path === failedPath
        ? 'failed'
        : path === loadedPath
          ? 'shown'
          : 'loading';
  const onImage = cover === 'shown';
  const subText = onImage
    ? 'text-[color:var(--color-font-on-fill)]'
    : 'text-[color:var(--color-font-sub-text)]';

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    onMove(event.key === 'ArrowLeft' ? -1 : 1);
  };

  return (
    <div
      data-cover={cover}
      className="group relative h-[var(--size-shelf-card-height)] w-[var(--size-shelf-card-width)]"
    >
      <div
        className={[
          'absolute top-0 box-border h-full w-[var(--size-shelf-card-width)] overflow-hidden',
          openToLeft ? 'right-0' : 'left-0',
          'rounded-[var(--radius-shelf-card)] bg-[color:var(--color-fill-neutral-weak)] p-[var(--space-padding-4)]',
          'group-focus-within:z-10 group-focus-within:w-[var(--size-shelf-card-width-open)]',
          'group-hover:z-10 group-hover:w-[var(--size-shelf-card-width-open)]',
        ].join(' ')}
      >
        {path !== null && cover !== 'failed' ? (
          // 장식 사진이라 alt 는 비운다(제목은 링크가 읽어 준다). 드래그는 카드가 받도록 사진은 끌지 않는다.
          // 서버 모드에서는 src 를 비워 두고, 받아 온 그림을 useApiImage 가 이 요소에 넣는다.
          <img
            ref={imageRef}
            src={image.directSrc}
            alt=""
            draggable={false}
            onLoad={() => setLoadedPath(path)}
            onError={() => setFailedPath(path)}
            className={[
              'pointer-events-none absolute inset-0 size-full object-cover',
              onImage ? '' : 'invisible',
            ].join(' ')}
          />
        ) : null}
        {onImage ? (
          // 좁을 때는 왼쪽 위만 어둡게(글리프·태그가 보이게), 넓어지면 사진 전체를 살짝 어둡게
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none absolute inset-0',
              'bg-[linear-gradient(161.77deg,var(--color-shelf-cover-shade)_4.92%,transparent_57.19%)]',
              'group-focus-within:bg-none group-focus-within:bg-[color:var(--color-background-dim)]',
              'group-hover:bg-none group-hover:bg-[color:var(--color-background-dim)]',
            ].join(' ')}
          />
        ) : null}
        <div className="relative flex h-full flex-col">
          <div
            className={[
              'flex items-center gap-[var(--space-gap-1)]',
              // 글리프 색: 사진 위는 흰색, 사진 없는 면은 시안처럼 sub-text(#43464D, 1226:78464 실측)
              onImage
                ? 'text-[color:var(--color-font-on-fill)]'
                : 'text-[color:var(--color-font-sub-text)]',
            ].join(' ')}
          >
            <Icon name={TYPE_GLYPH[type]} size={20} />
            <span
              className={`hidden [font:var(--text-body-b2-r)] ${subText} group-focus-within:inline group-hover:inline`}
            >
              {COPY[TYPE_LABEL[type]]}
            </span>
            <span className="ml-auto flex gap-[var(--space-gap-1)]">
              {tags.map((tag, index) => (
                <span
                  key={tag}
                  className={[
                    'rounded-[var(--radius-max)] bg-[color:var(--color-border-default)] px-[var(--space-padding-3)] py-[var(--space-tag-y)]',
                    `[font:var(--text-tag)] ${subText} backdrop-blur-[var(--blur-tag)]`,
                    // 좁은 카드에는 마지막 태그(Posted 가 있으면 Posted)만 보이고, 넓어지면 둘 다 보인다.
                    index < tags.length - 1
                      ? 'hidden group-focus-within:inline group-hover:inline'
                      : 'inline',
                  ].join(' ')}
                >
                  {COPY[TAG_LABEL[tag]]}
                </span>
              ))}
            </span>
          </div>
          <Link
            to={`/projects/${project.id}`}
            onKeyDown={handleKeyDown}
            className={[
              'mt-auto line-clamp-3 break-words no-underline',
              '[font:var(--text-subtitle-st2-sb)] tracking-[var(--letter-spacing-default)]',
              'group-focus-within:line-clamp-1 group-hover:line-clamp-1',
              // 사진 카드는 좁을 때 제목을 투명하게 둔다. 마우스·포커스가 오면 카드가 넓어지며 다시 보인다.
              onImage
                ? 'text-[color:var(--color-font-on-fill)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                : 'text-[color:var(--color-font-strong)]',
            ].join(' ')}
          >
            {project.title}
          </Link>
          <span
            className={`hidden items-center gap-[var(--space-gap-1)] [font:var(--text-body-b2-r)] ${subText} group-focus-within:flex group-hover:flex`}
          >
            {/* Figma 는 20px 편집 기록 아이콘. 그 파일이 없어 24px history 를 20 크기로 쓴다 */}
            <Icon name="history" size={20} />
            {COPY['H-04']}{' '}
            <time dateTime={project.lastEditedAt}>{formatEditedDate(project.lastEditedAt)}</time>
          </span>
        </div>
      </div>
    </div>
  );
}
