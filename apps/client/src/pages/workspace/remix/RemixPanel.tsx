import * as RadixTabs from '@radix-ui/react-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatorSummary, Id, RemixCandidate } from '@tome/shared';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { api, errorCopyKey, useApiImage } from '../../../shared/api';
import { COPY } from '../../../shared/copy';
import { ErrorNotice, Icon } from '../../../shared/ui';
import { candidateListState, initialOf, REMIX_TAB_LABEL, REMIX_TABS, type RemixTab } from './remix';

const CANDIDATES_KEY = 'remix-candidates';

/** 알약·목록에 그릴 사람(이름 + 사진 주소). 사진이 없으면(null) 이름 머리글자를 쓴다. */
export type RemixPerson = Pick<CreatorSummary, 'displayName' | 'avatarUrl'>;

/**
 * 둥근 사진. 사진 주소가 있으면 사진을, 없거나 못 받으면 이름 머리글자를 그린다.
 * 장식이라 이름은 옆 글자가 읽힌다. 테두리·바탕은 쓰는 곳이 정한다.
 */
export function PersonPhoto({ person, className }: { person: RemixPerson; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'box-border flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-max)] border-solid',
        '[font:var(--text-body-b2-m)] text-[color:var(--color-font-sub-text)]',
        className,
      ].join(' ')}
    >
      {person.avatarUrl === null ? (
        initialOf(person.displayName)
      ) : (
        <PhotoImage path={person.avatarUrl} fallback={initialOf(person.displayName)} />
      )}
    </span>
  );
}

/** 사진 주소가 있을 때만 그림을 받는다. 못 받으면 머리글자로 돌아간다. */
function PhotoImage({ path, fallback }: { path: string; fallback: string }) {
  const image = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(path, image);
  if (failed) return fallback;
  return <img ref={image} src={directSrc} alt="" className="size-full object-cover" />;
}

/** 목록 사진(1720:79891): 32 원, 회색 테두리 0.667 */
export function RemixAvatar({ person }: { person: RemixPerson }) {
  return (
    <PersonPhoto
      person={person}
      className={[
        'size-[var(--size-avatar-remix)] border-[length:var(--stroke-weight-remix-avatar)] border-[color:var(--color-grayscale-3)]',
        'bg-[color:var(--color-background-default)]',
      ].join(' ')}
    />
  );
}

/**
 * 위쪽 알약 Control(1720:80418): 리믹스 글리프 + "Remix with" + 오른쪽 32 썸네일(흰 테두리 1.12).
 * 열려 있으면 노란 면(#fff294, 312×48, 1720:80489), 닫혀 있고 상대가 있으면 반투명 흰 면(247×48, 1720:80415)이다.
 * 상대가 없으면 썸네일은 Brand(Weak) 면, 상대가 있으면 상대 사진을 보인다(프로필 이미지 노출 규칙 1720:80841).
 */
export function RemixLabel({ partner, open }: { partner: RemixPerson | undefined; open: boolean }) {
  return (
    <span
      className={[
        'box-border flex h-[var(--size-remix-control-height)] items-center gap-[var(--space-padding-7)] rounded-[var(--radius-max)]',
        'py-[var(--space-padding-3)] pr-[var(--space-padding-5)] pl-[var(--space-padding-3)]',
        '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]',
        'backdrop-blur-[var(--blur-background)]',
        open
          ? 'w-full bg-[color:var(--color-fill-brand)] shadow-[var(--shadow-icon-menu)]'
          : 'w-[var(--size-remix-control-done-width)] max-w-full bg-[color:var(--color-glass)] shadow-[var(--shadow-floating)]',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 items-center gap-[var(--space-padding-2)] pl-[var(--space-padding-2)]">
        <Icon name="glyph-remix" />
        <span className="min-w-0 truncate text-left">
          {partner === undefined ? COPY['RX-01'] : `${COPY['RX-01']} ${partner.displayName}`}
        </span>
      </span>
      {partner === undefined ? (
        <span
          aria-hidden="true"
          className={[
            'box-border size-[var(--size-avatar-thumb)] shrink-0 rounded-[var(--radius-max)] border-solid',
            'border-[length:var(--stroke-weight-remix-thumb)] border-[color:var(--color-background-default)] bg-[color:var(--color-fill-brand-weak)]',
          ].join(' ')}
        />
      ) : (
        <PersonPhoto
          person={partner}
          className={[
            'size-[var(--size-avatar-thumb)] border-[length:var(--stroke-weight-remix-thumb)] border-[color:var(--color-background-default)]',
            'bg-[color:var(--color-fill-brand-weak)]',
          ].join(' ')}
        />
      )}
    </span>
  );
}

/**
 * 목록 오른쪽 스크롤 막대(1720:79905: 굵기 4, Grayscale/3, 둥근 끝). 기본 스크롤 막대는 숨기고 이 막대를 그린다.
 * 막대 길이는 보이는 높이 ÷ 전체 높이, 위치는 스크롤 위치를 따른다. 넘치지 않으면 숨긴다.
 * 화면 상태가 아니라 DOM 값이라 다시 그리지 않고 막대 스타일만 바꾼다.
 */
function useScrollThumb(contentKey: unknown) {
  const list = useRef<HTMLUListElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const measure = useCallback(() => {
    const box = list.current;
    const bar = thumb.current;
    if (box === null || bar === null) return;
    const { scrollHeight, clientHeight, scrollTop } = box;
    if (clientHeight === 0 || scrollHeight <= clientHeight) {
      bar.hidden = true;
      return;
    }
    const size = (clientHeight * clientHeight) / scrollHeight;
    const offset = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - size);
    bar.hidden = false;
    bar.style.height = `${size}px`;
    bar.style.transform = `translateY(${offset}px)`;
  }, []);
  // 목록 높이는 고정(최대 3명)이라 내용이 바뀔 때와 스크롤할 때만 다시 잰다.
  useLayoutEffect(() => measure(), [measure, contentKey]);
  return { list, thumb, measure };
}

interface CandidateRowProps {
  creator: RemixCandidate;
  selected: boolean;
  choosing: boolean;
  favoriteBusy: boolean;
  onChoose: (id: Id) => void;
  onToggleFavorite: (creator: RemixCandidate) => void;
}

/**
 * 목록 한 줄(1720:79890): 32 원 사진 + 이름(16) + 한 줄 소개(14). 줄 높이 49.
 * 시안에는 하트가 없다. 즐겨찾기 기능은 남기되 손을 올리거나 포커스를 줄 때, 켜져 있을 때만 오른쪽에 보인다.
 */
function CandidateRow({
  creator,
  selected,
  choosing,
  favoriteBusy,
  onChoose,
  onToggleFavorite,
}: CandidateRowProps) {
  return (
    <li className="group relative flex items-start">
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        aria-busy={(choosing && selected) || undefined}
        disabled={choosing}
        onClick={() => onChoose(creator.id)}
        className={[
          'flex min-w-0 flex-1 cursor-pointer items-start gap-[var(--space-gap-3)] rounded-[var(--radius-1)] border-0 bg-transparent p-0 text-left',
          'disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <RemixAvatar person={creator} />
        <span className="flex min-w-0 flex-1 flex-col gap-[var(--space-gap-1)]">
          <span className="flex items-center gap-[var(--space-gap-1)] [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)]">
            <span className="truncate">{creator.displayName}</span>
            {/* 고른 상대는 색만이 아니라 체크 아이콘으로도 구분한다 */}
            {selected ? <Icon name="done" size={20} /> : null}
          </span>
          {creator.bio !== null ? (
            <span className="truncate [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
              {creator.bio}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        aria-label={`${COPY[creator.favorite ? 'RX-08' : 'RX-07']}: ${creator.displayName}`}
        aria-pressed={creator.favorite}
        aria-busy={favoriteBusy || undefined}
        disabled={favoriteBusy}
        onClick={() => onToggleFavorite(creator)}
        className={[
          'absolute top-0 right-0 flex cursor-pointer items-center justify-center rounded-[var(--radius-1)] border-0 bg-[color:var(--color-background-default)] p-0 text-[color:var(--color-font-sub-text)] disabled:cursor-not-allowed',
          creator.favorite ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        ].join(' ')}
      >
        <Icon name={creator.favorite ? 'favorite-solid' : 'favorite-outline'} />
      </button>
    </li>
  );
}

interface RemixPanelProps {
  id: string;
  /** 지금 리믹스 상대. 없으면 undefined */
  partner: CreatorSummary | undefined;
  /** 상대를 저장하는 중이면 true(목록을 잠근다) */
  choosing: boolean;
  /** 상대 저장이 실패했을 때의 오류 */
  chooseError: unknown;
  /** 상대를 고른다. 지금 상대를 한 번 더 누르면 null(리믹스 해제)이다. */
  onChoose: (creatorId: Id | null) => void;
}

const GLASS = 'box-border w-full bg-[color:var(--color-glass)] backdrop-blur-[var(--blur-glass)]';

/**
 * "Remix with" 패널(Control bar 2351:170408, 312×375). 위 노란 알약 + 아래 카드(검색칸, Rising·Favorite 탭, 새로고침, 목록).
 * 검색칸은 목록의 이름·소개를 이 화면 안에서만 거른다. 목록 줄을 누르면 상대로 고르고, 하트로 즐겨찾기를 켜고 끈다.
 * 지금 상대를 한 번 더 누르면 리믹스를 해제한다(#229).
 * 0명이거나 목록을 못 받으면 S-04 를 보여 준다. 리믹스 없이도 프롬프트로 일반 생성은 그대로 된다.
 */
export function RemixPanel({ id, partner, choosing, chooseError, onChoose }: RemixPanelProps) {
  const [tab, setTab] = useState<RemixTab>('rising');
  const [query, setQuery] = useState('');
  const [spinning, setSpinning] = useState(false);
  const queryClient = useQueryClient();
  const candidates = useQuery({
    queryKey: [CANDIDATES_KEY, tab],
    queryFn: () => api.getRemixCandidates(tab),
  });
  const favorite = useMutation({
    mutationFn: (creator: RemixCandidate) =>
      creator.favorite ? api.removeFavorite(creator.id) : api.addFavorite(creator.id),
    // 두 탭 모두 별 표시가 바뀌므로 둘 다 다시 받는다
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CANDIDATES_KEY] }),
  });
  const state = candidateListState(candidates);
  const needle = query.trim().toLowerCase();
  const shown =
    state.kind !== 'list'
      ? []
      : needle === ''
        ? state.creators
        : state.creators.filter(
            (creator) =>
              creator.displayName.toLowerCase().includes(needle) ||
              (creator.bio ?? '').toLowerCase().includes(needle),
          );
  const { list: listRef, thumb: thumbRef, measure: measureScroll } = useScrollThumb(shown);

  return (
    <div
      id={id}
      role="group"
      aria-label={COPY['RX-01']}
      className="flex w-[var(--size-remix-panel-width)] flex-col gap-[var(--space-gap-4)]"
    >
      <RemixLabel partner={partner} open />
      <RadixTabs.Root
        value={tab}
        onValueChange={(next) => {
          const found = REMIX_TABS.find((t) => t === next);
          if (found !== undefined) setTab(found);
        }}
        className="flex flex-col rounded-[var(--radius-node)] shadow-[var(--shadow-icon-menu)]"
      >
        <label
          className={[
            GLASS,
            'flex h-[var(--size-remix-search-height)] items-start gap-[var(--space-remix-icon-gap)] rounded-t-[var(--radius-node)]',
            'border-0 border-b border-solid border-[color:var(--color-border-default)]',
            'px-[var(--space-padding-6)] pt-[calc(var(--space-padding-4)+var(--space-gap-1))] pb-[var(--space-gap-4)]',
          ].join(' ')}
        >
          <Icon name="search" />
          <input
            type="text"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={COPY['FG-02']}
            aria-label={COPY['FG-02']}
            className={[
              'm-0 h-[var(--space-padding-8)] min-w-0 flex-1 border-0 bg-transparent p-0 outline-none focus-visible:outline-none!',
              '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)]',
              'placeholder:text-[color:var(--color-font-helper-text)]',
            ].join(' ')}
          />
        </label>
        <div
          className={[
            GLASS,
            'flex flex-col gap-[var(--space-gap-5)] rounded-b-[var(--radius-node)] px-[var(--space-padding-6)] py-[calc(var(--space-padding-4)+var(--space-gap-1))]',
          ].join(' ')}
        >
          <div className="flex items-center justify-between">
            <RadixTabs.List
              aria-label={COPY['RX-01']}
              className="box-border flex h-[var(--size-remix-tabs-height)] rounded-[var(--radius-1)] bg-[color:var(--color-background-weak)] p-[var(--space-padding-2)]"
            >
              {REMIX_TABS.map((value) => (
                <RadixTabs.Trigger
                  key={value}
                  value={value}
                  className={[
                    'box-border h-[var(--size-remix-tab-height)] w-[var(--size-remix-tab-width)] cursor-pointer rounded-[var(--radius-1)] border-0 px-[var(--space-padding-4)] py-[calc(var(--space-gap-1)/2)]',
                    'bg-transparent [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-helper-text)]',
                    'data-[state=active]:bg-[color:var(--color-background-default)] data-[state=active]:text-[color:var(--color-font-main-text)]',
                  ].join(' ')}
                >
                  {COPY[REMIX_TAB_LABEL[value]]}
                </RadixTabs.Trigger>
              ))}
            </RadixTabs.List>
            <button
              type="button"
              aria-label={COPY['RX-06']}
              aria-busy={candidates.isFetching || undefined}
              onClick={() => {
                setSpinning(true);
                void candidates.refetch();
              }}
              className="flex cursor-pointer items-center justify-center rounded-[var(--radius-1)] border-0 bg-transparent p-0 text-[color:var(--color-fill-neutral)]"
            >
              {/* 받는 동안 돈다. 다 받았으면 지금 바퀴를 마저 돌고 멈춘다(움직임 줄이기면 돌지 않음, #204) */}
              <span
                className={[
                  'inline-flex',
                  spinning || candidates.isFetching ? 'motion-safe:animate-spin' : '',
                ].join(' ')}
                data-spinning={spinning || candidates.isFetching || undefined}
                onAnimationIteration={() => {
                  if (!candidates.isFetching) setSpinning(false);
                }}
              >
                <Icon name="refresh" />
              </span>
            </button>
          </div>
          <RadixTabs.Content value={tab} className="flex flex-col gap-[var(--space-gap-4)]">
            {state.kind === 'empty' || (state.kind === 'list' && shown.length === 0) ? (
              <p
                role="status"
                className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
              >
                {COPY['S-04']}
              </p>
            ) : (
              // 목록(268) + 사이 16 + 스크롤 막대 4 (Content 1720:79888). 합이 288 이라 시안처럼 오른쪽 여백(16) 안으로 8 들어간다
              <div className="flex items-stretch gap-[var(--space-remix-scrollbar-gap)]">
                <ul
                  ref={listRef}
                  onScroll={measureScroll}
                  aria-busy={state.kind === 'loading' || undefined}
                  className="m-0 flex max-h-[var(--size-remix-list-visible)] w-[var(--size-remix-list-width)] shrink-0 list-none flex-col gap-[var(--space-remix-row-gap)] overflow-y-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {shown.map((creator) => (
                    <CandidateRow
                      key={creator.id}
                      creator={creator}
                      selected={partner?.id === creator.id}
                      choosing={choosing}
                      favoriteBusy={favorite.isPending && favorite.variables.id === creator.id}
                      onChoose={(creatorId) =>
                        onChoose(partner?.id === creatorId ? null : creatorId)
                      }
                      onToggleFavorite={(target) => favorite.mutate(target)}
                    />
                  ))}
                </ul>
                <span
                  aria-hidden="true"
                  className="relative w-[var(--size-remix-scrollbar-width)] shrink-0"
                >
                  <span
                    ref={thumbRef}
                    data-remix-scroll-thumb=""
                    hidden
                    className="absolute inset-x-0 top-0 rounded-[var(--radius-max)] bg-[color:var(--color-grayscale-3)]"
                  />
                </span>
              </div>
            )}
            {chooseError !== null ? (
              <ErrorNotice message={COPY[errorCopyKey(chooseError)]} />
            ) : null}
            {favorite.isError ? <ErrorNotice message={COPY[errorCopyKey(favorite.error)]} /> : null}
          </RadixTabs.Content>
        </div>
      </RadixTabs.Root>
    </div>
  );
}
