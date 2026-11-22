import type { CSSProperties } from 'react';
import { COPY } from '../../../shared/copy';
import { landingAsset } from '../assets';
import { LandingImage } from '../LandingImage';
import { SHOTS, type ShotId } from './storyImages';

/** 앱 화면 이미지 한 장. 겹쳐 놓고 투명도·이동으로 연출하므로 감싸는 칸(data-shot)을 움직인다. */
export function Shot({ id, className }: { id: ShotId; className?: string }) {
  const { file, w, h } = SHOTS[id];
  return (
    <div data-shot={id} className={`story-shot ${className ?? ''}`}>
      <LandingImage file={file} width={w} height={h} loading="lazy" className="story-shot-img" />
    </div>
  );
}

const TITLES = {
  mywork: { name: 'ON-23a', left: 'MY W', right: 'RK', glyph: 'story-glyph-mywork.svg' },
  remix: { name: 'ON-23b', left: 'RE', right: 'IX', glyph: 'story-glyph-remix.svg' },
  derive: { name: 'ON-23c', left: 'D', right: 'RIVE', glyph: 'story-glyph-derive.svg' },
} as const;

export type StoryTitleId = keyof typeof TITLES;

function glyphStyle(file: string): CSSProperties {
  const url = landingAsset(file);
  if (url === undefined) return {};
  const image = `url("${url}")`;
  return { maskImage: image, WebkitMaskImage: image };
}

/**
 * 장 제목. 글자 사이 기호는 시안의 SVG 를 마스크로 쓴다(글자색을 따라간다).
 * 화면에는 그림 글자(aria-hidden)로, 보조 기기에는 sr-only 텍스트(이름)로 읽힌다.
 */
export function StoryTitle({
  id,
  subtitle,
}: {
  id: StoryTitleId;
  /** 부제 문구 ID. 없으면 제목만 */
  subtitle?: 'ON-24';
}) {
  const t = TITLES[id];
  return (
    <div data-story-title={id} className="story-title">
      <h2 className="story-logotype">
        <span className="sr-only">{COPY[t.name]}</span>
        <span aria-hidden="true" className="story-logotype-art">
          {t.left}
          <span className="story-glyph" style={glyphStyle(t.glyph)} />
          {t.right}
        </span>
      </h2>
      {subtitle === undefined ? null : <p className="story-subtitle">{COPY[subtitle]}</p>}
    </div>
  );
}

interface TryRemixProps {
  onPress: () => void;
  onFocus: () => void;
}

/**
 * "Try Remix!" 말풍선. 모양은 시안의 SVG 를 마스크로 쓰고(분홍 면 + 배경 흐림), 그림자는 토큰이다.
 * 실제 <button> 이라 키보드로 포커스·실행할 수 있다.
 */
export function TryRemixButton({ onPress, onFocus }: TryRemixProps) {
  const url = landingAsset('story-bubble.svg');
  const shape: CSSProperties =
    url === undefined ? {} : { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` };
  return (
    <button
      type="button"
      data-story-bubble
      className="story-bubble"
      onClick={onPress}
      onFocus={onFocus}
    >
      <span data-bubble-bob className="story-bubble-bob">
        <span
          aria-hidden="true"
          className={
            url === undefined ? 'story-bubble-shape story-bubble-fallback' : 'story-bubble-shape'
          }
          style={shape}
        />
        <span className="story-bubble-text">{COPY['ON-28']}</span>
      </span>
    </button>
  );
}
