const iconFiles = import.meta.glob('../../assets/icons/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const brandFiles = import.meta.glob('../../assets/brand/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function fileName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.svg$/, '');
}

/**
 * 아이콘 이름 → SVG 주소. 아이콘 파일 `icon-edit.svg` 는 `edit`, 브랜드 파일 `logo.svg` 는 `logo` 로 찾는다.
 * 파일이 없는 환경에서는 비어 있다.
 */
export const ICON_URLS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(iconFiles).map(([path, url]) => [fileName(path).replace(/^icon-/, ''), url]),
  ),
  ...Object.fromEntries(Object.entries(brandFiles).map(([path, url]) => [fileName(path), url])),
};
