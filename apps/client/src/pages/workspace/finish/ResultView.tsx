import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useApiImage } from '../../../shared/api';
import { COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';

interface ResultViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 크게 보여 줄 결과 그림의 API 경로(/assets/answers/:id/full). 로그인 토큰이 필요해 useApiImage 로 받는다 */
  imagePath: string;
  /** 그림 설명(제목 등). 화면 읽기 프로그램이 읽는다 */
  alt: string;
  /** Download 를 눌렀을 때. 그림 받기(인증이 필요한 /assets 주소)는 부모가 한다 */
  onDownload: () => void;
  /** 받는 중이면 true(버튼을 잠근다) */
  downloading?: boolean;
  /** 받기에 실패했을 때 보여 줄 안내 문구. 없으면 아무것도 그리지 않는다 */
  errorMessage?: string;
  /** 닫힌 뒤 포커스 처리. 여는 버튼(Trigger)이 없어서, 포커스를 돌려줄 곳은 부모가 정한다 */
  onCloseAutoFocus?: (event: Event) => void;
}

const CLOSE_CIRCLE = [
  'absolute top-[var(--space-padding-6)] right-[var(--space-padding-6)] z-10',
  'flex size-[var(--size-result-button)] cursor-pointer items-center justify-center p-0',
  'rounded-[var(--radius-max)] border-0 text-[color:var(--color-font-on-fill)]',
  'bg-[color-mix(in_srgb,var(--color-background-default)_30%,transparent)] backdrop-blur-[var(--blur-tag)]',
  'hover:bg-[color-mix(in_srgb,var(--color-background-default)_45%,transparent)]',
].join(' ');

/**
 * 큰 그림. 창 안(Portal)에 그림 요소와 함께 처음 그려지도록 따로 둔다(#242).
 * 창은 열린 뒤 한 박자 늦게 그림 요소를 붙이므로, 바깥에서 useApiImage 를 부르면
 * 그림을 이미 받아 둔 경우(같은 주소를 캔버스가 먼저 받음) 그림 요소가 생기기 전에 주소를 넣으려다 놓친다.
 */
function ResultImage({ imagePath, alt }: { imagePath: string; alt: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const { directSrc } = useApiImage(imagePath, imageRef);
  return (
    <img
      ref={imageRef}
      src={directSrc}
      alt={alt}
      className="block h-[min(63vh,calc(100vh-var(--size-header-height)-var(--size-result-button)))] max-h-full w-[71vw] max-w-full rounded-[var(--radius-node)] bg-[color:var(--color-fill-card)] object-cover shadow-[var(--shadow-floating)]"
    />
  );
}

/**
 * 결과 크게 보기(라이트박스). 큰 그림 위 오른쪽 위에 닫기 동그라미, 그림 아래에 Download 가 든 알약.
 * 시안의 Share·Plugin 은 범위 밖이라 뺐다. 화면 전체를 덮는 모달이라 포커스가 안에 갇히고,
 * Esc·닫기·바깥 클릭으로 닫힌다.
 */
export function ResultView({
  open,
  onOpenChange,
  imagePath,
  alt,
  onDownload,
  downloading = false,
  errorMessage,
  onCloseAutoFocus,
}: ResultViewProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 grid place-items-center overflow-y-auto bg-[color:var(--color-background-dim)] p-[var(--space-padding-8)]">
          <RadixDialog.Content
            aria-describedby={undefined}
            {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
            className="flex max-h-full max-w-full flex-col items-center gap-[var(--space-padding-8)]"
          >
            <RadixDialog.Title className="sr-only">{alt}</RadixDialog.Title>
            <div className="relative max-w-full">
              <ResultImage imagePath={imagePath} alt={alt} />
              <RadixDialog.Close asChild>
                <button type="button" aria-label={COPY['D-11']} className={CLOSE_CIRCLE}>
                  <Icon name="close" />
                </button>
              </RadixDialog.Close>
            </div>
            {errorMessage !== undefined ? (
              <p
                role="alert"
                className="m-0 rounded-[var(--radius-max)] bg-[color:var(--color-background-default)] px-[var(--space-padding-6)] py-[var(--space-padding-3)] [font:var(--text-body-b2-r)] text-[color:var(--color-font-main-text)] shadow-[var(--shadow-03)]"
              >
                {errorMessage}
              </p>
            ) : null}
            <div className="flex items-center rounded-[var(--radius-max)] bg-[color-mix(in_srgb,var(--color-background-default)_90%,transparent)] p-[var(--space-padding-3)] shadow-[var(--shadow-03)] backdrop-blur-[var(--blur-background)]">
              <button
                type="button"
                aria-busy={downloading || undefined}
                disabled={downloading}
                onClick={onDownload}
                className="flex cursor-pointer items-center gap-[var(--space-gap-3)] rounded-[var(--radius-max)] border-0 bg-transparent px-[var(--space-padding-6)] py-[var(--space-padding-3)] [font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)] hover:bg-[color:var(--color-shadow-weak)] disabled:cursor-not-allowed disabled:text-[color:var(--color-font-disable)] disabled:hover:bg-transparent"
              >
                <Icon name="download" />
                {COPY['D-13']}
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
