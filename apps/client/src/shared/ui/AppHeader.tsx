import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { COPY } from '../copy';
import { ICON_URLS } from './icon-registry';

export type AppHeaderSection = 'tome' | 'agora';

interface AppHeaderProps {
  /** 지금 있는 곳. 그쪽 글자 로고가 진해진다. null 이면 둘 다 연하다(Figma ETC 변형). */
  current: AppHeaderSection | null;
  /** 프로필 링크 주소(예: /creators/<내 id>) */
  profileTo: string;
  /** 아고라 링크 주소. 기본 /agora */
  agoraTo?: string;
}

/**
 * 글자 로고. 글자색(currentColor)으로 칠해서 지금 있는 곳은 진하게, 아닌 곳은 연하게 보인다.
 * 로고 파일이 없는 환경에서는 같은 크기의 빈 자리를 그린다.
 */
function Wordmark({ name, widthVar }: { name: string; widthVar: string }) {
  const url = ICON_URLS[name];
  const style: CSSProperties = {};
  if (url !== undefined) {
    const image = `url("${url}")`;
    Object.assign(style, {
      backgroundColor: 'currentColor',
      maskImage: image,
      WebkitMaskImage: image,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    });
  }
  return (
    <span
      aria-hidden="true"
      data-wordmark={name}
      className={`block h-[var(--size-logo-height)] ${widthVar}`}
      style={style}
    />
  );
}

const sectionLink = (active: boolean) =>
  [
    'inline-flex rounded-[var(--radius-1)]',
    // 시안의 연한 색(#C5CBD7)은 흰 바탕 대비가 1.6:1 이라 안내 글자색으로 진하게 했다.
    active
      ? 'text-[color:var(--color-font-strong)]'
      : 'text-[color:var(--color-font-helper-text)] hover:text-[color:var(--color-font-sub-text)]',
  ].join(' ');

/** 기본 프로필 그림 주소. 자산이 없는 환경에서는 undefined */
const profileIcon = ICON_URLS['profile-default'];

/**
 * 앱 공통 헤더. 왼쪽 TÓME 로고·AGORA 글자(지금 있는 곳은 aria-current), 오른쪽 내 프로필.
 * 시안의 검색 칸은 이번 범위가 아니라 그리지 않는다.
 */
export function AppHeader({ current, profileTo, agoraTo = '/agora' }: AppHeaderProps) {
  return (
    <header className="flex h-[var(--size-header-height)] items-center justify-between px-[var(--space-header-x)]">
      <nav className="flex items-center gap-[var(--space-gap-3)]">
        <Link
          to="/"
          aria-label={COPY['W-06']}
          aria-current={current === 'tome' ? 'page' : undefined}
          className={sectionLink(current === 'tome')}
        >
          <Wordmark name="logo" widthVar="w-[var(--size-logo-width)]" />
        </Link>
        <Link
          to={agoraTo}
          aria-current={current === 'agora' ? 'page' : undefined}
          className={sectionLink(current === 'agora')}
        >
          {/* AGORA 는 그림 파일이 아니라 글자다(Figma Nav Links 1226:80898, 108×48). 서체 Open Sans */}
          <span className="flex h-[var(--size-logo-agora-height)] w-[var(--size-logo-agora-width)] items-center [font:var(--text-header-nav)] tracking-[var(--letter-spacing-heading-h1)]">
            {COPY['HD-01']}
          </span>
        </Link>
      </nav>
      <Link
        to={profileTo}
        aria-label={COPY['HD-02']}
        className={[
          'box-border inline-flex size-[var(--size-header-avatar)] items-center justify-center overflow-hidden rounded-[var(--radius-max)]',
          // 그림 파일이 없는 환경에서만 테두리 있는 빈 동그라미로 그린다
          profileIcon === undefined
            ? 'border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)] bg-[color:var(--color-fill-neutral-weak)]'
            : '',
        ].join(' ')}
      >
        {/* 기본 프로필(Profile Icon Container 1226:80942). 그라데이션 원색 그대로라 mask 가 아니라 img 로 그린다 */}
        {profileIcon === undefined ? (
          <span aria-hidden="true" data-avatar-placeholder="" />
        ) : (
          <img src={profileIcon} alt="" className="block size-full" />
        )}
      </Link>
    </header>
  );
}
