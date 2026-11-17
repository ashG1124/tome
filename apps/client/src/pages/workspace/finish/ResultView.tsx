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
}

const CIRCLE = [
  'flex size-[var(--size-result-button)] cursor-pointer items-center justify-center p-0',
  'rounded-[var(--radius-max)] border-0 bg-[color:var(--color-background-default)] text-[color:var(--color-font-sub-text)]',
  'shadow-[var(--shadow-03)] disabled:cursor-not-allowed disabled:text-[color:var(--color-font-disable)]',
].join(' ');

/**
 * 결과 크게 보기. 큰 그림과 오른쪽 위 Download·닫기 버튼(시안의 Share·Plugin 은 빼기로 했다).
 * 화면 전체를 덮는 모달이라 포커스가 안에 갇히고, Esc·닫기·바깥 클릭으로 닫힌다.
 */
export function ResultView({
  open,
  onOpenChange,
  imagePath,
  alt,
  onDownload,
  downloading = false,
}: ResultViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const { directSrc } = useApiImage(imagePath, imageRef);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 grid place-items-center overflow-y-auto bg-[color:var(--color-result-backdrop)] p-[var(--grid-margin)]">
          <RadixDialog.Content
            aria-describedby={undefined}
            className="relative flex max-h-full max-w-full flex-col items-end gap-[var(--space-padding-8)]"
          >
            <RadixDialog.Title className="sr-only">{alt}</RadixDialog.Title>
            <div className="flex gap-[var(--space-gap-5)]">
              <button
                type="button"
                aria-label={COPY['D-13']}
                aria-busy={downloading || undefined}
                disabled={downloading}
                onClick={onDownload}
                className={CIRCLE}
              >
                <Icon name="download" />
              </button>
              <RadixDialog.Close asChild>
                <button type="button" aria-label={COPY['D-11']} className={CIRCLE}>
                  <Icon name="close" />
                </button>
              </RadixDialog.Close>
            </div>
            <img
              ref={imageRef}
              src={directSrc}
              alt={alt}
              className="block h-[calc(100vh-4*var(--grid-margin))] w-auto max-w-full rounded-[var(--radius-node)] object-contain"
            />
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
