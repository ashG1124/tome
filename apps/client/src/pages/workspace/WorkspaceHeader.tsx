import { Link } from 'react-router';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ICON_URLS } from '../../shared/ui/icon-registry';

/** 서버가 제목 없이 만든 새 프로젝트의 기본 제목. 초기 화면에서는 눈에 안 보인다(3174:174539). 낭독기용 제목은 남긴다. */
const PLACEHOLDER_TITLE = 'Untitled';

interface WorkspaceHeaderProps {
  /** 프로젝트 제목. 불러오는 중이면 undefined */
  title: string | undefined;
  /** 리믹스 상대 이름. 있으면 제목 뒤에 "| remix with 이름"을 붙인다(2513:226457) */
  partnerName?: string;
}

/**
 * 워크스페이스 위쪽 줄. 왼쪽 TÓME 로고를 누르면 홈으로 가고, 홈은 "Update" 플래시를 띄운다.
 * 가운데에 프로젝트 제목(리믹스 중이면 상대 표기 포함). 로고 파일이 없는 환경에서는 같은 크기의 빈 자리를 그린다.
 */
export function WorkspaceHeader({ title, partnerName }: WorkspaceHeaderProps) {
  const logo = ICON_URLS.logo;
  const logoBox = 'block h-[var(--size-logo-height)] w-[var(--size-logo-width)]';
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center p-[var(--space-padding-8)]">
      <Link
        to="/"
        state={{ flash: 'update' }}
        aria-label={COPY['W-06']}
        className="pointer-events-auto inline-flex justify-self-start rounded-[var(--radius-1)]"
      >
        {logo !== undefined ? (
          <img src={logo} alt="" className={logoBox} />
        ) : (
          <span aria-hidden="true" className={logoBox} />
        )}
      </Link>
      <h1
        className={`${title === PLACEHOLDER_TITLE ? 'sr-only ' : ''}m-0 max-w-[50vw] truncate text-center [font:var(--text-subtitle-st1-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]`}
      >
        {title ?? SKELETON_COPY.workspace}
        {title !== undefined && partnerName !== undefined ? (
          <>
            {/* 구분 막대는 장식이라 화면 낭독기는 "제목 remix with 이름"으로 읽는다.
                띄어쓰기는 뒤 글자 안에 둬야 이름이 제목과 붙어 읽히지 않는다 */}
            <span
              aria-hidden="true"
              className="ml-[var(--space-padding-5)] mr-[var(--space-padding-3)] text-[color:var(--color-font-helper-text)]"
            >
              |
            </span>
            {` ${COPY['RX-04']} ${partnerName}`}
          </>
        ) : null}
      </h1>
      <span aria-hidden="true" />
    </header>
  );
}
