const files = import.meta.glob('../../assets/onboarding/*', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 랜딩 자산 이름(예: `landing-hero-01.webp`) → 주소. 자산 저장소에서 받지 않은 환경에서는 비어 있다. */
export const LANDING_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop() ?? path, url]),
);

export function landingAsset(name: string): string | undefined {
  return LANDING_ASSETS[name];
}
