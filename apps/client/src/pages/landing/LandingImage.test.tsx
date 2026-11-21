import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingImage } from './LandingImage';

vi.mock('./assets', () => ({
  landingAsset: (name: string) => (name === 'missing.webp' ? undefined : `/fake/${name}`),
}));

describe('LandingImage', () => {
  it('장식 이미지(alt 비움)로 그리고 loading 을 그대로 쓴다', () => {
    const { container } = render(<LandingImage file="a.webp" loading="lazy" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('불러오기에 실패하면 회색 자리 표시로 바뀐다', () => {
    const { container } = render(<LandingImage file="a.webp" loading="eager" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-landing-placeholder="a.webp"]')).not.toBeNull();
  });

  it('파일이 없는 환경에서도 자리 표시를 그린다', () => {
    const { container } = render(<LandingImage file="missing.webp" loading="lazy" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-landing-placeholder]')).not.toBeNull();
  });
});
