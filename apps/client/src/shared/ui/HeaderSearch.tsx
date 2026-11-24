import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { COPY } from '../copy';
import { Icon } from './Icon';
import {
  AGORA_SEARCH_SCOPES,
  AGORA_TAB_PATHS,
  agoraSearchQuery,
  agoraTabHref,
  agoraTabOfPath,
  isLiveFilterPath,
  type AgoraSearchScope,
} from './agora-search';

const SCOPE_COPY = {
  project: COPY['AGS-04'],
  creator: COPY['AGS-05'],
  topic: COPY['AGS-06'],
} as const satisfies Record<AgoraSearchScope, string>;

/** 탭 링크로 화면을 옮겼다는 표시(주소 state). 새 화면의 헤더가 고른 탭에 포커스를 돌려준다. */
const TAB_FOCUS_STATE = 'agoraTabFocus';

function cameFromTab(state: unknown): boolean {
  return typeof state === 'object' && state !== null && TAB_FOCUS_STATE in state;
}

const FOCUS_RING =
  'focus-visible:outline-2! focus-visible:outline-offset-[var(--focus-outline-offset)]! focus-visible:outline-solid! focus-visible:outline-[color:var(--color-border-input)]!';

/**
 * 헤더 검색창(Figma 1226:81052): 돋보기·입력칸·(아고라 변형에서만) Project/Creator/Topic 탭.
 * 탭은 화면을 옮기는 링크다(/agora · /agora/creators · /agora/topics, #214). 검색어(?q=…)는 탭을 옮겨도 그대로 가져가고,
 * 새 API 없이 지금 탭 화면이 이미 받은 데이터를 거른다.
 */
export function HeaderSearch({ withFilters }: { withFilters: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const live = isLiveFilterPath(location.pathname);
  const tab = agoraTabOfPath(location.pathname);
  const fromUrl = (params.get('q') ?? '').trim();
  const [value, setValue] = useState(fromUrl);
  const selectedRef = useRef<HTMLAnchorElement>(null);

  // 주소가 바깥에서 바뀌면(뒤로 가기 등) 입력칸도 따라간다. 내가 입력해서 바뀐 주소와 같으면 건드리지 않는다.
  const [seen, setSeen] = useState(fromUrl);
  if (seen !== fromUrl) {
    setSeen(fromUrl);
    if (value.trim() !== fromUrl) setValue(fromUrl);
  }

  // 탭을 눌러 화면이 바뀌면 헤더가 새로 그려져 포커스가 사라진다. 키보드로 고른 탭에 포커스를 돌려준다.
  useEffect(() => {
    if (cameFromTab(location.state)) selectedRef.current?.focus({ preventScroll: true });
  }, [location.key, location.state]);

  const apply = (nextValue: string) => {
    setValue(nextValue);
    if (!live) return;
    setParams(new URLSearchParams(agoraSearchQuery(nextValue).slice(1)), { replace: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (live || value.trim() === '') return;
    void navigate(agoraTabHref(tab ?? 'project', value));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && value !== '') {
      event.preventDefault();
      apply('');
    }
  };

  return (
    <form
      role="search"
      aria-label={COPY['AGS-07']}
      onSubmit={submit}
      className={[
        'flex h-[var(--size-header-search-height)] w-[var(--size-header-search-width)] shrink-0 items-center justify-between',
        'rounded-[var(--radius-max)] bg-[color:var(--color-fill-neutral-weak)] px-[var(--space-padding-7)]',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[var(--focus-outline-offset)] has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-[color:var(--color-border-input)]',
      ].join(' ')}
    >
      <label className="flex min-w-0 flex-1 items-center gap-[var(--space-gap-3)]">
        <span className="sr-only">{COPY['AGS-07']}</span>
        <Icon name="header-search" size={24} className="text-[color:var(--color-font-sub-text)]" />
        <input
          type="search"
          value={value}
          placeholder={COPY['AGS-03']}
          autoComplete="off"
          onChange={(event) => apply(event.target.value)}
          onKeyDown={onKeyDown}
          className={[
            // 입력칸 안쪽 검은 사각형은 없앤다(전역 :focus-visible 이 레이어 밖이라 ! 로 이긴다). 포커스는 바깥 알약 테두리가 보여 준다
            'min-w-0 flex-1 border-0 bg-transparent p-0 outline-none! focus-visible:outline-none!',
            '[font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)] text-[color:var(--color-font-main-text)]',
            'placeholder:text-[color:var(--color-font-helper-text)]',
            '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none',
          ].join(' ')}
        />
      </label>
      {withFilters ? (
        <nav
          aria-label={COPY['AT-03']}
          className="ml-[var(--space-gap-4)] flex shrink-0 items-center gap-[var(--space-gap-4)]"
        >
          {AGORA_SEARCH_SCOPES.map((item) => {
            const selected = item === tab;
            // 탭 화면 그 자체면 page, 그 탭 아래 화면(핫토픽·프로젝트 상세)이면 true
            const current = selected
              ? location.pathname.replace(/\/+$/, '') === AGORA_TAB_PATHS[item]
                ? 'page'
                : 'true'
              : undefined;
            return (
              <Link
                key={item}
                ref={selected ? selectedRef : undefined}
                to={agoraTabHref(item, value)}
                state={{ [TAB_FOCUS_STATE]: true }}
                aria-current={current}
                className={[
                  'inline-flex h-[var(--size-header-filter-height)] items-center rounded-[var(--radius-max)] border border-solid',
                  '[font:var(--text-body-b1-r)] [font-weight:var(--font-weight-medium)]',
                  FOCUS_RING,
                  selected
                    ? 'border-[color:var(--color-border-default)] bg-[color:var(--color-background-default)] px-[var(--space-padding-6)] text-[color:var(--color-font-strong)]'
                    : 'border-transparent bg-transparent px-0 text-[color:var(--color-font-sub-text)] hover:text-[color:var(--color-font-strong)]',
                ].join(' ')}
              >
                {SCOPE_COPY[item]}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </form>
  );
}
