import { expect, test, type Page } from '@playwright/test';

// 아고라 헤더 탭(Project · Creator · Topic, #214): 주소로 들어가기, 탭 전환, 키보드, 탭별 검색, 기준 화면 잘림 없음.
// 가짜 응답 모드의 고정 데이터(공개작 제목·Lind·Mara·핫토픽 3개)를 쓴다.

const TABS = [
  { name: 'Project', path: '/agora', heading: 'Recommended Project' },
  { name: 'Creator', path: '/agora/creators', heading: 'Rising Creator' },
  { name: 'Topic', path: '/agora/topics', heading: 'Hot Topic' },
] as const;

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tome.token', 'fake-token');
    localStorage.setItem('tome.fake.consented', '1');
  });
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Agora sections' });
const tab = (page: Page, name: string) => tabs(page).getByRole('link', { name, exact: true });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search' });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('탭마다 주소로 바로 들어가고, 그 탭만 aria-current="page" 다', async ({ page }) => {
  for (const { name, path, heading } of TABS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    for (const other of TABS) {
      if (other.name === name) {
        await expect(tab(page, other.name)).toHaveAttribute('aria-current', 'page');
      } else {
        await expect(tab(page, other.name)).not.toHaveAttribute('aria-current');
      }
    }
  }
});

test('탭을 누르면 화면과 주소가 바뀐다(Creator 탭은 창작자만, Topic 탭은 핫토픽 목록)', async ({
  page,
}) => {
  await page.goto('/agora');
  await tab(page, 'Creator').click();
  await expect(page).toHaveURL(/\/agora\/creators$/);
  await expect(page.getByRole('region', { name: 'Rising Creator' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'New Creator' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recommended Project' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Rising Creator' }).getByRole('link', { name: /Lind/ }),
  ).toHaveAttribute('href', /^\/creators\//);

  await tab(page, 'Topic').click();
  await expect(page).toHaveURL(/\/agora\/topics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hot Topic' })).toBeVisible();
  // "+N": Warm Task Lighting 은 공개작 6개 중 4장만 보여 2개가 남는다
  await expect(
    page.getByRole('link', { name: 'Warm Task Lighting, 2 more projects' }),
  ).toBeVisible();

  await tab(page, 'Project').click();
  await expect(page).toHaveURL(/\/agora$/);
  await expect(page.getByRole('region', { name: 'Recommended Project' })).toBeVisible();
  // 핫토픽 전체 목록은 Topic 탭이 맡아 See more 링크가 없다
  await expect(page.getByRole('link', { name: 'See more' })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/agora\/topics$/);
  await expect(tab(page, 'Topic')).toHaveAttribute('aria-current', 'page');
});

test('키보드만으로 탭을 옮기고, 옮긴 뒤에도 고른 탭에 포커스와 테두리가 남는다', async ({
  page,
}) => {
  await page.goto('/agora');
  await search(page).focus();
  await page.keyboard.press('Tab');
  await expect(tab(page, 'Project')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(tab(page, 'Creator')).toBeFocused();
  await expect(tab(page, 'Creator')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/agora\/creators$/);
  await expect(tab(page, 'Creator')).toBeFocused();
  await expect(tab(page, 'Creator')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await expect(tab(page, 'Topic')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/agora\/topics$/);
  await expect(tab(page, 'Topic')).toBeFocused();
});

test('검색어는 지금 탭 안에서 거르고, 탭을 옮겨도 그대로 간다', async ({ page }) => {
  await page.goto('/agora');
  await search(page).fill('desk');
  await expect(page).toHaveURL(/\/agora\?q=desk$/);
  const recommended = page.getByRole('region', { name: 'Recommended Project' });
  await expect(recommended.getByRole('link', { name: /Desk lamp in warm light/ })).toBeVisible();
  await expect(recommended.getByRole('link', { name: /Urban commuter shoe/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Results' })).toHaveText('Results: 2');

  await search(page).fill('lind');
  await tab(page, 'Creator').click();
  await expect(page).toHaveURL(/\/agora\/creators\?q=lind$/);
  await expect(search(page)).toHaveValue('lind');
  const rising = page.getByRole('region', { name: 'Rising Creator' });
  await expect(rising.getByRole('link', { name: /Lind/ })).toBeVisible();
  await expect(rising.getByRole('link', { name: /Mara/ })).toHaveCount(0);

  await search(page).fill('harbor');
  await tab(page, 'Topic').click();
  await expect(page).toHaveURL(/\/agora\/topics\?q=harbor$/);
  await expect(page.getByRole('link', { name: 'Quiet Harbor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Urban Trail' })).toHaveCount(0);

  await search(page).fill('zzzz');
  await expect(page.getByText('No results.')).toBeVisible();
  await search(page).press('Escape');
  await expect(page).toHaveURL(/\/agora\/topics$/);
  await expect(page.getByRole('link', { name: 'Urban Trail' })).toBeVisible();
});

/** 두 상자가 겹치는지(맞닿기만 하면 겹침이 아니다) */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}

for (const size of [
  { width: 1728, height: 1083 },
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
]) {
  test(`${size.width}×${size.height}: 세 탭 모두 가로로 넘치거나 겹치는 곳이 없다`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    for (const { path, heading } of TABS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, path).toBeLessThanOrEqual(size.width);

      // 헤더: 검색창·탭·프로필이 화면 안에 있고 서로 겹치지 않는다
      const searchBox = (await page.getByRole('search').boundingBox())!;
      const profile = (await page.getByRole('link', { name: 'My profile' }).boundingBox())!;
      expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(profile.x);
      expect(profile.x + profile.width).toBeLessThanOrEqual(size.width);
      for (const name of ['Project', 'Creator', 'Topic']) {
        const box = (await tab(page, name).boundingBox())!;
        expect(box.x + box.width, name).toBeLessThanOrEqual(searchBox.x + searchBox.width);
      }

      // 구역 제목과 카드가 겹치지 않고, 칸 목록(Creator·Topic 탭)의 카드끼리도 겹치지 않는다
      const sections = page.locator('section');
      const count = await sections.count();
      for (let i = 0; i < count; i += 1) {
        const section = sections.nth(i);
        const title = (await section.getByRole('heading').boundingBox())!;
        const items = section.locator(':scope > ul > li');
        const boxes = [];
        for (let k = 0; k < (await items.count()); k += 1) {
          const box = await items.nth(k).boundingBox();
          if (box) boxes.push(box);
        }
        for (const box of boxes) expect(overlaps(title, box), `${path} title`).toBe(false);
        for (let a = 0; a < boxes.length; a += 1) {
          for (let b = a + 1; b < boxes.length; b += 1) {
            expect(overlaps(boxes[a]!, boxes[b]!), `${path} items ${a}/${b}`).toBe(false);
          }
        }
      }
      // Topic 탭 칸 목록은 화면 안에서 줄을 바꾼다(오른쪽이 잘리지 않는다)
      if (path === '/agora/topics') {
        const cards = page.locator('ul > li > a[href^="/agora/topics/"]');
        for (let k = 0; k < (await cards.count()); k += 1) {
          const box = (await cards.nth(k).boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        }
      }
    }
  });
}
