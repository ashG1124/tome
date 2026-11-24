import type { AnswerSummary, Id } from '@tome/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useApiImage } from '../../../shared/api';
import { COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';
import { scrollThumb, type ScrollThumb } from './finish';

interface VersionPickerProps {
  /** undefined 면 아직 불러오는 중 */
  candidates: readonly AnswerSummary[] | undefined;
  value: Id | null;
  onChange: (id: Id) => void;
  disabled?: boolean;
}

/** 불러오는 동안 보여 줄 빈 칸 수 */
const LOADING_SLOTS = 3;

/** 썸네일 칸 크기·모서리. 포커스 테두리가 잘리지 않게 스크롤 영역 안쪽에 여백을 둔다. */
const SLOT =
  'relative shrink-0 size-[var(--size-version-thumb)] rounded-[var(--radius-version-thumb)]';

/**
 * 대표 버전 고르기. 라디오 묶음이라 Tab 으로 한 번 들어오고 ←/→ 로 고른다.
 * 고른 칸은 어둡게 덮고 체크 표시를 올린다(색만으로 구분하지 않음).
 * 넘치면 가로로 스크롤되고, 아래 막대가 지금 보이는 위치를 알려 준다.
 */
/** 버전 썸네일. 서버 그림은 로그인 토큰이 필요해서 useApiImage 로 받아 넣는다. */
function VersionThumb({ path }: { path: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc } = useApiImage(path, ref);
  return <img ref={ref} src={directSrc} alt="" className="block size-full object-cover" />;
}

export function VersionPicker({ candidates, value, onChange, disabled }: VersionPickerProps) {
  const name = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ScrollThumb>({ visible: false, offset: 0, size: 1 });

  const measure = useCallback(() => {
    const box = scroller.current;
    if (box !== null) setThumb(scrollThumb(box));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, candidates]);

  const loading = candidates === undefined;

  return (
    <fieldset
      aria-busy={loading || undefined}
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-[var(--space-padding-3)] border-0 p-0"
    >
      <legend className="mb-[var(--space-padding-3)] p-0 [font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)] text-[color:var(--color-font-sub-text)]">
        {COPY['D-04']}
      </legend>
      <div className="flex flex-col gap-[var(--space-gap-4)]">
        <div
          ref={scroller}
          onScroll={measure}
          className={[
            'flex gap-[var(--space-padding-3)] overflow-x-auto',
            // 포커스 테두리(2px + 간격 2px)가 스크롤 영역에 잘리지 않도록 안쪽 여백을 두고 바깥으로 되돌린다.
            '-m-[var(--space-padding-2)] p-[var(--space-padding-2)]',
            // 시안은 내용 폭(650)에서 잘린다(1183:54969). 키보드로 고르는 동안만 테두리가 보이게 자르기를 푼다.
            '[clip-path:inset(0_var(--space-padding-2))] has-[input:focus-visible]:[clip-path:none]',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          ].join(' ')}
        >
          {loading
            ? Array.from({ length: LOADING_SLOTS }, (_, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`${SLOT} bg-[color:var(--color-gray-20)]`}
                />
              ))
            : candidates.map((answer, index) => {
                const checked = answer.id === value;
                return (
                  <label
                    key={answer.id}
                    className={[
                      SLOT,
                      'cursor-pointer overflow-hidden bg-[color:var(--color-fill-card)]',
                      'has-[input:focus-visible]:outline-[length:var(--stroke-weight-bold)] has-[input:focus-visible]:outline-solid',
                      'has-[input:focus-visible]:outline-[color:var(--color-font-main-text)]',
                      'has-[input:focus-visible]:outline-offset-[var(--focus-outline-offset)]',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={answer.id}
                      checked={checked}
                      onChange={() => onChange(answer.id)}
                      aria-label={`${COPY['D-12']} ${index + 1}`}
                      className="sr-only"
                    />
                    <VersionThumb path={answer.thumbUrl} />
                    {checked ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center bg-[color:var(--color-background-dim)] text-[color:var(--color-font-on-fill)]"
                      >
                        <Icon name="check-32" size={32} />
                      </span>
                    ) : null}
                  </label>
                );
              })}
        </div>
        {thumb.visible ? (
          <div
            aria-hidden="true"
            className="relative h-[var(--size-scroll-bar)] rounded-[var(--radius-max)] bg-[color:var(--color-fill-neutral-weak)]"
          >
            <div
              className="absolute top-0 h-full rounded-[var(--radius-max)] bg-[color:var(--color-grayscale-5)]"
              style={{ left: `${thumb.offset * 100}%`, width: `${thumb.size * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
