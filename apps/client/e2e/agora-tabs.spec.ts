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

// #253 전시 맥(1728×1117, 메뉴 막대 34 를 뺀 1083)에서 시안 Agora(3100:129594)처럼 화면을 꽉 채운다.
test('1728×1083: Project 탭은 시안 자리·크기 그대로 화면 높이를 꼭 채운다', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await page.goto('/agora');
  const heading = (name: string) => page.getByRole('heading', { level: 2, name, exact: true });
  await expect(heading('Hot Topic')).toBeVisible();
  expect((await heading('Recommended Project').boundingBox())!.y).toBeCloseTo(124, 0);
  expect((await heading('Rising Creator').boundingBox())!.y).toBeCloseTo(506, 0);
  expect((await heading('Hot Topic').boundingBox())!.y).toBeCloseTo(671, 0);

  const card = (await page
    .getByRole('region', { name: 'Recommended Project' })
    .getByRole('link')
    .first()
    .boundingBox())!;
  expect(card).toEqual({ x: 18, y: 172, width: 364, height: 284 });
  // 추천 줄은 화면 오른쪽 끝까지 간다(카드가 오른쪽에서 잘려 보인다)
  const row = (await page
    .getByRole('region', { name: 'Recommended Project' })
    .getByRole('list')
    .boundingBox())!;
  expect(row.x + row.width).toBeCloseTo(1728, 0);

  const topic = (await page
    .getByRole('region', { name: 'Hot Topic' })
    .getByRole('link')
    .first()
    .boundingBox())!;
  expect(topic).toEqual({ x: 18, y: 719, width: 393, height: 308 });
  // 아래 여백 56 으로 화면이 끝난다(세로로 남거나 넘치지 않는다)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1083);
});

for (const height of [1000, 1117, 960]) {
  test(`높이 ${height}: Project 탭 카드가 화면 높이를 따라 줄거나 늘어 화면을 꼭 채운다`, async ({
    page,
  }) => {
    const width = height === 960 ? 1536 : 1728;
    await page.setViewportSize({ width, height });
    await page.goto('/agora');
    const topics = page.getByRole('region', { name: 'Hot Topic' });
    await expect(topics).toBeVisible();
    // 넘치지 않고(세로 스크롤 없음), 핫토픽 묶음 아래 여백 56 으로 화면이 끝난다
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
    const topic = (await topics.getByRole('link').first().boundingBox())!;
    expect(Math.abs(topic.y + topic.height + 56 - height)).toBeLessThanOrEqual(2);
    // 비율은 시안 그대로(추천 364:284, 핫토픽 콜라주+제목 393:308 의 폭)
    const card = (await page
      .getByRole('region', { name: 'Recommended Project' })
      .getByRole('link')
      .first()
      .boundingBox())!;
    expect(card.width / card.height).toBeCloseTo(364 / 284, 1);
  });
}

test('1728×1083: Topic 탭 3열과 Creator 탭 칸이 화면 폭(좌우 18 안쪽)을 꽉 채운다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1728, height: 1083 });
  await page.goto('/agora/topics');
  const bundles = page.locator('ul > li > a[href^="/agora/topics/"]');
  await expect(bundles).toHaveCount(3);
  const first = (await bundles.nth(0).boundingBox())!;
  const third = (await bundles.nth(2).boundingBox())!;
  expect(first.x).toBeCloseTo(18, 0);
  expect(third.y).toBeCloseTo(first.y, 0);
  expect(third.x + third.width).toBeCloseTo(1710, 0);
  // 콜라주는 393:269 비율 그대로 칸 폭을 따라 커진다(1728 에서 약 551×377)
  expect(first.width).toBeGreaterThan(540);

  await page.goto('/agora/creators');
  const list = page.getByRole('region', { name: 'Rising Creator' }).getByRole('list');
  await expect(list).toBeVisible();
  const columns = await list.evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(' ').map(Number.parseFloat),
  );
  expect(columns).toHaveLength(5);
  const box = (await list.boundingBox())!;
  const used = columns.reduce((sum, w) => sum + w, 0) + 16 * (columns.length - 1);
  expect(box.x + used).toBeCloseTo(1710, 0);
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
