import type { Ref } from 'react';
import { Link } from 'react-router';
import { COPY } from '../../shared/copy';
import { LandingLogo } from './LandingLogo';

const MENU = ['ON-02a', 'ON-02b', 'ON-02c', 'ON-02d'] as const;

/** 헤더(3445:27263). 메뉴와 Get Started 는 모두 전시 코드 화면으로 간다. 스크롤해도 위에 붙어 있다. */
export function LandingHeader({ logoRef }: { logoRef?: Ref<HTMLAnchorElement> }) {
  return (
    <header className="landing-header">
      <Link to="/" ref={logoRef} aria-label={COPY['W-06']} className="landing-header-logo">
        <LandingLogo size={{ mark: 27.077, wordWidth: 60.867, wordHeight: 35.2 }} />
      </Link>
      <div className="landing-header-right">
        <nav aria-label={COPY['ON-01']} className="landing-header-nav">
          {MENU.map((id, index) => (
            <Link
              key={id}
              to="/enter"
              className={
                index === 0 ? 'landing-nav-link' : 'landing-nav-link landing-nav-link-faded'
              }
            >
              {COPY[id]}
            </Link>
          ))}
        </nav>
        <Link to="/enter" className="landing-cta">
          {COPY['ON-03']}
        </Link>
      </div>
    </header>
  );
}
