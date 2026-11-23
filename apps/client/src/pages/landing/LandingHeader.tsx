import type { Ref } from 'react';
import { Link } from 'react-router';
import { COPY } from '../../shared/copy';
import { LandingLogo } from './LandingLogo';

/** 헤더 메뉴: 누르면 해당 챕터로 스크롤한다(링크 이름은 앵커 id) */
const MENU = [
  { id: 'mywork', label: 'ON-02a' },
  { id: 'remix', label: 'ON-02b' },
  { id: 'derive', label: 'ON-02c' },
] as const;

export type ChapterId = (typeof MENU)[number]['id'];

interface LandingHeaderProps {
  logoRef?: Ref<HTMLAnchorElement>;
  /** 지금 화면에 보이는 챕터(메뉴 강조) */
  active: ChapterId;
  /** MY WORK 가 화면을 가득 채우는 동안 바탕을 투명하게 */
  clear: boolean;
  onNavigate: (id: ChapterId) => void;
}

/** 헤더. 챕터 메뉴는 같은 화면 안에서 스크롤하고, Get Started 는 전시 코드 화면으로 간다. 스크롤해도 위에 붙어 있다. */
export function LandingHeader({ logoRef, active, clear, onNavigate }: LandingHeaderProps) {
  return (
    <header className={clear ? 'landing-header landing-header-clear' : 'landing-header'}>
      <Link to="/" ref={logoRef} aria-label={COPY['W-06']} className="landing-header-logo">
        <LandingLogo size={{ mark: 27.077, wordWidth: 60.867, wordHeight: 35.2 }} />
      </Link>
      <div className="landing-header-right">
        <nav aria-label={COPY['ON-01']} className="landing-header-nav">
          {MENU.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={item.id === active ? 'location' : undefined}
              className={
                item.id === active ? 'landing-nav-link' : 'landing-nav-link landing-nav-link-faded'
              }
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.id);
              }}
            >
              {COPY[item.label]}
            </a>
          ))}
        </nav>
        <Link to="/enter" className="landing-cta">
          {COPY['ON-03']}
        </Link>
      </div>
    </header>
  );
}
