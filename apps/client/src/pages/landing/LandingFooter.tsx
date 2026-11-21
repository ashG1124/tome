import type { CSSProperties } from 'react';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { landingAsset } from './assets';
import { LandingImage } from './LandingImage';
import { LandingLogo } from './LandingLogo';

const CONTACT = [
  { icon: 'landing-footer-location.svg', size: 20, lines: ['ON-16a', 'ON-16b'] },
  { icon: 'landing-footer-calendar.svg', size: 20, lines: ['ON-17'] },
  { icon: 'landing-footer-mail.svg', size: 17.778, lines: ['ON-18'] },
  { icon: 'landing-footer-time.svg', size: 17.778, lines: ['ON-19a', 'ON-19b'] },
] as const;

/**
 * 푸터(3445:27495). 로고·태그라인, CONTACT, 맨 위로 버튼, 저작권만 둔다.
 * 연결 기능이 없는 링크(Explore·Get Started 열, 메일 링크)는 넣지 않는다.
 */
export function LandingFooter({ onBackToTop }: { onBackToTop: () => void }) {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-brand">
        <LandingLogo size={{ mark: 41.538, wordWidth: 93.375, wordHeight: 54 }} />
        <p className="landing-footer-tagline">{COPY['ON-04']}</p>
      </div>
      <section aria-labelledby="landing-contact-title" className="landing-contact">
        <h2 id="landing-contact-title" className="landing-contact-title">
          {COPY['ON-15']}
        </h2>
        <ul className="landing-contact-list">
          {CONTACT.map((item) => (
            <li key={item.icon} className="landing-contact-item">
              <span
                aria-hidden="true"
                className="landing-contact-icon"
                style={{ '--icon': item.size } as CSSProperties}
              >
                <LandingImage file={item.icon} loading="lazy" className="landing-fill" />
              </span>
              <span className="landing-contact-text">
                {item.lines.map((id, index) => (
                  <span key={id} className="landing-contact-line">
                    {index > 0 ? <br /> : null}
                    {COPY[id]}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button
        type="button"
        aria-label={COPY['ON-21']}
        className="landing-top-button"
        onClick={onBackToTop}
      >
        {landingAsset('landing-footer-up.svg') === undefined ? (
          <Icon name="arrow-up" size={24} />
        ) : (
          <LandingImage file="landing-footer-up.svg" loading="lazy" className="landing-top-arrow" />
        )}
      </button>
      <p className="landing-copyright">{COPY['ON-20']}</p>
    </footer>
  );
}
