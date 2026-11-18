import * as RadixTabs from '@radix-ui/react-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatorSummary, Id, RemixCandidate } from '@tome/shared';
import { useState } from 'react';
import { api, errorCopyKey } from '../../../shared/api';
import { COPY } from '../../../shared/copy';
import { ErrorNotice, Icon } from '../../../shared/ui';
import { candidateListState, initialOf, REMIX_TAB_LABEL, REMIX_TABS, type RemixTab } from './remix';

const CANDIDATES_KEY = 'remix-candidates';

/** 사진 자리. 사진 주소가 아직 없어서(서버도 null) 이름 머리글자를 쓴다. */
export function RemixAvatar({ name }: { name: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'box-border flex size-[var(--size-avatar-remix)] shrink-0 items-center justify-center rounded-[var(--radius-max)]',
        'border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-dark)]',
        'bg-[color:var(--color-background-default)] [font:var(--text-body-b2-m)] text-[color:var(--color-font-sub-text)]',
      ].join(' ')}
    >
      {name === undefined ? '' : initialOf(name)}
    </span>
  );
}

/** 위쪽 알약: 리믹스 글리프 + "Remix with" (+ 상대 이름). 열려 있으면 노란 면, 닫혀 있으면 흰 면이다. */
export function RemixLabel({ partner, open }: { partner: string | undefined; open: boolean }) {
  return (
    <span
      className={[
        'box-border flex w-full items-center gap-[var(--space-gap-1)] rounded-[var(--radius-max)] py-[var(--space-padding-3)] pr-[var(--space-padding-5)] pl-[var(--space-padding-5)]',
        'shadow-[var(--shadow-icon-menu)] [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]',
        open ? 'bg-[color:var(--color-fill-brand)]' : 'bg-[color:var(--color-background-default)]',
      ].join(' ')}
    >
      <Icon name="glyph-remix" />
      <span className="min-w-0 flex-1 truncate text-left">
        {partner === undefined ? COPY['RX-01'] : `${COPY['RX-01']} ${partner}`}
      </span>
      <RemixAvatar name={partner} />
    </span>
  );
}

interface CandidateRowProps {
  creator: RemixCandidate;
  selected: boolean;
  choosing: boolean;
  favoriteBusy: boolean;
  onChoose: (id: Id) => void;
  onToggleFavorite: (creator: RemixCandidate) => void;
}

function CandidateRow({
  creator,
  selected,
  choosing,
  favoriteBusy,
  onChoose,
  onToggleFavorite,
}: CandidateRowProps) {
  return (
    <li className="flex items-start gap-[var(--space-gap-3)]">
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
        <RemixAvatar name={creator.displayName} />
        <span className="flex min-w-0 flex-1 flex-col gap-[var(--space-gap-1)]">
          <span className="flex items-center gap-[var(--space-gap-1)] [font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)]">
            <span className="truncate">{creator.displayName}</span>
            {/* 고른 상대는 색만이 아니라 체크 아이콘으로도 구분한다 */}
            {selected ? <Icon name="done" size={20} /> : null}
          </span>
          {creator.bio !== null ? (
            <span className="truncate [font:var(--text-body-b2-r)] text-[color:var(--color-font-main-text)]">
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
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-1)] border-0 bg-transparent p-0 text-[color:var(--color-font-sub-text)] disabled:cursor-not-allowed"
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
  onChoose: (creatorId: Id) => void;
}

/**
 * "Remix with" 패널(Control bar 1720:80619). 위 노란 알약 + 아래 카드(Rising·Favorite 탭, 새로고침, 목록).
 * 검색칸은 만들지 않는다(F-007). 목록 줄을 누르면 상대로 고르고, 별 버튼으로 즐겨찾기를 켜고 끈다.
 * 0명이거나 목록을 못 받으면 S-04 를 보여 준다. 리믹스 없이도 프롬프트로 일반 생성은 그대로 된다.
 */
export function RemixPanel({ id, partner, choosing, chooseError, onChoose }: RemixPanelProps) {
  const [tab, setTab] = useState<RemixTab>('rising');
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

  return (
    <div
      id={id}
      role="group"
      aria-label={COPY['RX-01']}
      className="flex w-[var(--size-remix-panel-width)] flex-col gap-[var(--space-padding-3)]"
    >
      <RemixLabel partner={partner?.displayName} open />
      <RadixTabs.Root
        value={tab}
        onValueChange={(next) => {
          const found = REMIX_TABS.find((t) => t === next);
          if (found !== undefined) setTab(found);
        }}
        className={[
          'flex flex-col gap-[var(--space-gap-5)] rounded-[var(--radius-node)] px-[var(--space-padding-6)] py-[var(--space-padding-6)]',
          'bg-[color:var(--color-background-default)] shadow-[var(--shadow-icon-menu)]',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <RadixTabs.List
            aria-label={COPY['RX-01']}
            className="flex rounded-[var(--radius-1)] bg-[color:var(--color-background-weak)] p-[var(--space-padding-2)]"
          >
            {REMIX_TABS.map((value) => (
              <RadixTabs.Trigger
                key={value}
                value={value}
                className={[
                  'box-border w-[var(--size-remix-tab-width)] cursor-pointer rounded-[var(--radius-1)] border-0 px-[var(--space-padding-4)] py-[var(--space-padding-2)]',
                  'bg-transparent [font:var(--text-body-b2-r)] text-[color:var(--color-font-helper-text)]',
                  'data-[state=active]:bg-[color:var(--color-background-default)] data-[state=active]:[font:var(--text-body-b2-m)] data-[state=active]:text-[color:var(--color-font-main-text)]',
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
            onClick={() => void candidates.refetch()}
            className="flex cursor-pointer items-center justify-center rounded-[var(--radius-1)] border-0 bg-transparent p-0 text-[color:var(--color-font-sub-text)]"
          >
            <Icon name="refresh" />
          </button>
        </div>
        <RadixTabs.Content value={tab} className="flex flex-col gap-[var(--space-gap-4)]">
          {state.kind === 'empty' ? (
            <p
              role="status"
              className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
            >
              {COPY['S-04']}
            </p>
          ) : (
            <ul
              aria-busy={state.kind === 'loading' || undefined}
              className="m-0 flex max-h-[var(--size-remix-list-max-height)] list-none flex-col gap-[var(--space-padding-7)] overflow-y-auto p-0"
            >
              {state.kind === 'list'
                ? state.creators.map((creator) => (
                    <CandidateRow
                      key={creator.id}
                      creator={creator}
                      selected={partner?.id === creator.id}
                      choosing={choosing}
                      favoriteBusy={favorite.isPending && favorite.variables.id === creator.id}
                      onChoose={onChoose}
                      onToggleFavorite={(target) => favorite.mutate(target)}
                    />
                  ))
                : null}
            </ul>
          )}
          {chooseError !== null ? <ErrorNotice message={COPY[errorCopyKey(chooseError)]} /> : null}
          {favorite.isError ? <ErrorNotice message={COPY[errorCopyKey(favorite.error)]} /> : null}
        </RadixTabs.Content>
      </RadixTabs.Root>
    </div>
  );
}
