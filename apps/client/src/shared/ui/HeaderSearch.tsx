import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { COPY } from '../copy';
import { Icon } from './Icon';
import {
  AGORA_SEARCH_SCOPES,
  agoraSearchQuery,
  parseAgoraSearch,
  type AgoraSearchScope,
} from './agora-search';

const SCOPE_COPY = {
  project: COPY['AGS-04'],
  creator: COPY['AGS-05'],
  topic: COPY['AGS-06'],
} as const satisfies Record<AgoraSearchScope, string>;

/** 입력하는 대로 같은 화면에서 거르는 아고라 화면(홈·핫토픽 목록·핫토픽). 그 밖의 화면은 Enter 로 아고라에 가서 적용한다. */
function isLiveFilterPath(pathname: string): boolean {
  return (
    pathname === '/agora' || pathname === '/agora/topics' || pathname.startsWith('/agora/topics/')
  );
}

const FOCUS_RING =
  'focus-visible:outline-2! focus-visible:outline-offset-[var(--focus-outline-offset)]! focus-visible:outline-solid! focus-visible:outline-[color:var(--color-border-input)]!';

/**
 * 헤더 검색창(Figma 1226:81052): 돋보기·입력칸·(아고라 변형에서만) Project/Creator/Topic 필터.
 * 새 API 없이, 아고라 화면이 이미 받은 데이터를 제목·창작자 이름으로 거른다. 검색어는 주소 쿼리(?q=…&in=…)에 둔다.
 */
export function HeaderSearch({ withFilters }: { withFilters: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const live = isLiveFilterPath(location.pathname);
  const fromUrl = parseAgoraSearch(params);
  const [value, setValue] = useState(fromUrl.q);
  const [scope, setScope] = useState<AgoraSearchScope>(fromUrl.scope);
  const inputRef = useRef<HTMLInputElement>(null);
  const groupId = useId();

  // 주소가 바깥에서 바뀌면(뒤로 가기 등) 입력칸도 따라간다. 내가 입력해서 바뀐 주소와 같으면 건드리지 않는다.
  const [seen, setSeen] = useState({ q: fromUrl.q, scope: fromUrl.scope });
  if (seen.q !== fromUrl.q || seen.scope !== fromUrl.scope) {
    setSeen({ q: fromUrl.q, scope: fromUrl.scope });
    if (value.trim() !== fromUrl.q) setValue(fromUrl.q);
    setScope(fromUrl.scope);
  }

  const apply = (nextValue: string, nextScope: AgoraSearchScope) => {
    setValue(nextValue);
    setScope(nextScope);
    if (!live) return;
    const next = new URLSearchParams(agoraSearchQuery({ q: nextValue, scope: nextScope }));
    setParams(next, { replace: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (live || value.trim() === '') return;
    void navigate(`/agora${agoraSearchQuery({ q: value, scope })}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && value !== '') {
      event.preventDefault();
      apply('', scope);
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
          ref={inputRef}
          type="search"
          value={value}
          placeholder={COPY['AGS-03']}
          autoComplete="off"
          onChange={(event) => apply(event.target.value, scope)}
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
        <div
          role="group"
          aria-labelledby={groupId}
          className="ml-[var(--space-gap-4)] flex shrink-0 items-center gap-[var(--space-gap-4)]"
        >
          <span id={groupId} className="sr-only">
            {COPY['AGS-08']}
          </span>
          {AGORA_SEARCH_SCOPES.map((item) => {
            const selected = item === scope;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={selected}
                onClick={() => apply(value, item)}
                className={[
                  'inline-flex h-[var(--size-header-filter-height)] cursor-pointer items-center rounded-[var(--radius-max)] border border-solid',
                  '[font:var(--text-body-b1-r)] [font-weight:var(--font-weight-medium)]',
                  FOCUS_RING,
                  selected
                    ? 'border-[color:var(--color-border-default)] bg-[color:var(--color-background-default)] px-[var(--space-padding-6)] text-[color:var(--color-font-strong)]'
                    : 'border-transparent bg-transparent px-0 text-[color:var(--color-font-sub-text)]',
                ].join(' ')}
              >
                {SCOPE_COPY[item]}
              </button>
            );
          })}
        </div>
      ) : null}
    </form>
  );
}
