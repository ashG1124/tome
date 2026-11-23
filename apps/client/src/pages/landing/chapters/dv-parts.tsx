import { forwardRef, type CSSProperties } from 'react';
import { COPY } from '../../../shared/copy';
import { LandingImage } from '../LandingImage';
import { ob } from './shared';

/** "DERIVE" 머리글자 사이의 고리 모양 글리프. 글자색(currentColor)을 따른다. */
function DeriveGlyph() {
  return (
    <svg className="dv-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c5.5 0 10 2.2 10 5 0 1.3-.9 2.4-2.5 3.3-.5.3-.8.4-.8.6 0 .2.3.3.8.6C21.1 13.4 22 14.7 22 16c0 2.8-4.5 5-10 5S2 18.8 2 16c0-1.3.9-2.4 2.5-3.3.5-.3.8-.4.8-.6s-.3-.3-.8-.6C2.9 10.6 2 9.3 2 8c0-2.8 4.5-5 10-5z" />
    </svg>
  );
}

/** 작은 제목(D◯RIVE). 글리프가 두 번째 글자 E 를 대신한다. */
export function DeriveEyebrow() {
  const word = COPY['ON-23c'];
  return (
    <p className="dv-eyebrow" aria-label={word}>
      <span aria-hidden="true">{word.slice(0, 1)}</span>
      <DeriveGlyph />
      <span aria-hidden="true">{word.slice(2)}</span>
    </p>
  );
}

/** 큰 제목(두 줄) */
export function DeriveTitle() {
  return (
    <h2 id="dv-title" className="dv-title">
      {COPY['ON-32a']}
      <br />
      {COPY['ON-32b']}
    </h2>
  );
}

/** 이미지 한 장을 칸(left·top·width·height) 안에 놓는다. 파일이 없으면 같은 크기의 빈 자리가 된다. */
export function Shot({
  file,
  box,
  className,
  loading = 'lazy',
}: {
  file: string;
  box?: readonly [number, number, number, number];
  className: string;
  loading?: 'eager' | 'lazy';
}) {
  const style: CSSProperties | undefined = box
    ? { left: box[0], top: box[1], width: box[2], height: box[3] }
    : undefined;
  return (
    <div className={className} style={style}>
      <LandingImage
        file={ob(file)}
        loading={loading}
        className="dv-fit"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

/** 점무늬로 옅어지며 이어지는 챕터 아래 띠 */
export const DotTail = forwardRef<HTMLDivElement>(function DotTail(_props, ref) {
  return <div ref={ref} className="dv-tail" aria-hidden="true" />;
});
