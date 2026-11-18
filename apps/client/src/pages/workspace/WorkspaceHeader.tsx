import { Link } from 'react-router';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ICON_URLS } from '../../shared/ui/icon-registry';

interface WorkspaceHeaderProps {
  /** 프로젝트 제목. 불러오는 중이면 undefined */
  title: string | undefined;
}

/**
 * 워크스페이스 위쪽 줄. 왼쪽 TÓME 로고를 누르면 홈으로 가고, 홈은 "Update" 플래시를 띄운다.
 * 가운데에 프로젝트 제목. 로고 파일이 없는 환경에서는 같은 크기의 빈 자리를 그린다.
 */
export function WorkspaceHeader({ title }: WorkspaceHeaderProps) {
  const logo = ICON_URLS.logo;
  const logoBox = 'block h-[var(--size-logo-height)] w-[var(--size-logo-width)]';
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center p-[var(--space-padding-8)]">
      <Link
        to="/"
        state={{ flash: 'update' }}
        aria-label={COPY['W-06']}
        className="inline-flex justify-self-start rounded-[var(--radius-1)]"
      >
        {logo !== undefined ? (
          <img src={logo} alt="" className={logoBox} />
        ) : (
          <span aria-hidden="true" className={logoBox} />
        )}
      </Link>
      <h1 className="m-0 max-w-[50vw] truncate text-center [font:var(--text-subtitle-st1-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
        {title ?? SKELETON_COPY.workspace}
      </h1>
      <span aria-hidden="true" />
    </header>
  );
}
