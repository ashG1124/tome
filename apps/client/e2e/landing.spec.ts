import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 960 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`랜딩은 ${viewport.width}×${viewport.height} 에서 가로 스크롤이 없다`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.inner);

    // 끝까지 내려가도 가로 스크롤이 생기지 않는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const after = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(after).toBeLessThanOrEqual(widths.inner);
    await context.close();
  });
}

test('Get Started 를 누르면 전시 코드 화면으로 간다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started' }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByRole('heading', { name: 'Enter the exhibition code' })).toBeVisible();
});

test('Tab 키로 로고 → 메뉴 → Get Started 에 닿고 포커스 테두리가 보인다', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Get Started' });
  const names: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    names.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          '',
      ),
    );
    if (await cta.evaluate((el) => el === document.activeElement)) break;
  }
  expect(names).toEqual(['TÓME', 'My Work', 'Remix', 'Derive', 'Identity', 'Get Started']);
  await expect(cta).toBeFocused();
  await expect(cta).toHaveCSS('outline-style', 'solid');
});

test('맨 위로 버튼을 누르면 맨 위로 올라가고 포커스가 로고 링크로 간다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Back to top' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('link', { name: 'TÓME' })).toBeFocused();
});

test.describe('움직임 줄이기', () => {
  test.use({ reducedMotion: 'reduce' });

  test('연출 없이 정지 상태로 그려진다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    // 히어로 이미지·로고가 처음부터 보이는 상태이고 transform 이 걸려 있지 않다
    const states = await page.evaluate(() => {
      const tile = document.querySelector('[data-hero-tile]') as HTMLElement;
      const enter = document.querySelector('[data-hero-enter]') as HTMLElement;
      const logo = document.querySelector('[data-hero-logo-in]') as HTMLElement;
      return [tile, enter, logo].map((el) => {
        const style = getComputedStyle(el);
        return { opacity: style.opacity, transform: style.transform };
      });
    });
    expect(states[0]).toEqual({ opacity: '1', transform: 'none' });
    expect(states[1]).toEqual({ opacity: '1', transform: 'none' });
    expect(states[2]).toEqual({ opacity: '1', transform: 'none' });

    // 스크롤해도 이미지가 움직이지 않는다
    const before = await page.locator('[data-hero-tile]').first().boundingBox();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    const after = await page.locator('[data-hero-tile]').first().boundingBox();
    expect(Math.round((before?.y ?? 0) - (after?.y ?? 0))).toBe(
      await page.evaluate(() => Math.round(window.scrollY)),
    );
  });
});

// 스크롤 스토리(#47). STORY_SHOTS 에 폴더를 주면 체크포인트 스크린샷을 그 폴더에 저장한다(눈 확인용).
const SHOTS = process.env.STORY_SHOTS;

/** 장(chapter)마다 고정(pin)이 시작되는 스크롤 위치와 고정 구간 길이 */
async function chapterSpans(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((chapter) => {
      const stage = chapter.querySelector<HTMLElement>('[data-stage]') as HTMLElement;
      const top = chapter.getBoundingClientRect().top + window.scrollY;
      return {
        name: chapter.dataset.chapter as string,
        top,
        pinLength: chapter.getBoundingClientRect().height - stage.getBoundingClientRect().height,
      };
    }),
  );
}

async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(900); // scrub 0.5초가 따라잡을 시간
}

async function windowWidths(page: Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
}

test.describe('스크롤 스토리', () => {
  test('1920×1080 에서 끝까지 스크롤하면 장마다 고정되고 푸터에 닿으며 콘솔 오류가 없다', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('[data-story-mode="motion"]')).toHaveCount(1);
    const spans = await chapterSpans(page);
    expect(spans.map((span) => span.name)).toEqual(['mywork', 'remix', 'derive']);
    for (const span of spans) {
      expect(span.pinLength).toBeGreaterThan(1000);
      for (const [label, fraction] of [
        ['start', 0.03],
        ['mid', 0.5],
        ['end', 0.97],
      ] as const) {
        await scrollToY(page, span.top + span.pinLength * fraction);
        // 고정 구간 안에서는 화면 한 장이 위에 붙어 있다
        const stageTop = await page.evaluate(
          (name) =>
            document.querySelector(`[data-chapter="${name}"] [data-stage]`)?.getBoundingClientRect()
              .top,
          span.name,
        );
        expect(Math.abs(stageTop ?? 999)).toBeLessThanOrEqual(2);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-${span.name}-${label}.png` });
      }
    }
    if (SHOTS) {
      // 장 안 더 촘촘한 체크포인트(연출 순서를 스토리보드와 비교하는 용도)
      for (const span of spans) {
        for (const percent of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
          await scrollToY(page, span.top + (span.pinLength * percent) / 100);
          await page.screenshot({ path: `${SHOTS}/story-${span.name}-p${percent}.png` });
        }
      }
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'Back to top' })).toBeInViewport();
    await expect(page.getByText('© 2026. All rights reserved.')).toBeInViewport();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-footer.png` });
    const widths = await windowWidths(page);
    expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('Tab 으로 Try Remix 버튼에 가면 보이는 자리로 스크롤되고, Enter 로 Remix with 패널 단계로 간다', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto('/');
    const bubble = page.getByRole('button', { name: 'Try Remix!' });
    await expect(bubble).toHaveCount(1);
    await page.getByRole('link', { name: 'Get Started' }).focus();
    await page.keyboard.press('Tab');
    await expect(bubble).toBeFocused();
    await page.waitForTimeout(1200);
    await expect(bubble).toBeInViewport();
    const opacity = Number(await bubble.evaluate((el) => getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0.9);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-remix-tab-focus.png` });
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
    // 패널 단계: Remix with 패널 그림이 보이는 상태
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(
              getComputedStyle(document.querySelector('[data-shot="frameF"]') as HTMLElement)
                .opacity,
            ),
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.95);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-remix-after-enter.png` });
    await context.close();
  });

  test('스페이스·PageDown 만으로 스토리를 지나 푸터의 맨 위로 버튼까지 갈 수 있다', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    const top = page.getByRole('button', { name: 'Back to top' });
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press(i % 2 === 0 ? 'PageDown' : 'Space');
      await page.waitForTimeout(50);
      const inView = await top.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
      });
      if (inView) break;
    }
    await expect(top).toBeInViewport();
  });

  test('1536×960 에서도 스토리를 지나는 동안 가로 스크롤이 없다', async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
    const page = await context.newPage();
    await page.goto('/');
    const spans = await chapterSpans(page);
    for (const span of spans) {
      for (const fraction of [0.05, 0.5, 0.95]) {
        await scrollToY(page, span.top + span.pinLength * fraction);
        const widths = await windowWidths(page);
        expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
        if (SHOTS && fraction === 0.5) {
          await page.screenshot({ path: `${SHOTS}/story-1536-${span.name}-mid.png` });
        }
      }
    }
    await context.close();
  });

  test('롤링 줄은 끝없이 흐르고, 마우스를 올린 줄만 멈춘다', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    const spans = await chapterSpans(page);
    const derive = spans[2];
    if (!derive) throw new Error('장이 없다');
    await scrollToY(page, derive.top + derive.pinLength * 0.03);
    const offset = (kind: string) =>
      page.evaluate((name) => {
        const track = document.querySelector(`[data-roll-row="${name}"] [data-roll-track]`);
        return new DOMMatrix(getComputedStyle(track as Element).transform).m41;
      }, kind);
    const first = { projects: await offset('projects'), creators: await offset('creators') };
    await page.waitForTimeout(600);
    const second = { projects: await offset('projects'), creators: await offset('creators') };
    expect(second.projects).toBeLessThan(first.projects); // 왼쪽으로 흐른다
    expect(second.creators).toBeGreaterThan(first.creators); // 가운데 줄은 반대 방향
    await page.locator('[data-roll-row="projects"]').hover();
    const held = await offset('projects');
    const creatorBefore = await offset('creators');
    await page.waitForTimeout(600);
    expect(await offset('projects')).toBe(held); // 올린 줄은 멈춘다
    expect(await offset('creators')).not.toBe(creatorBefore); // 다른 줄은 계속 흐른다
  });

  test('새로고침하면 맨 위에서 다시 시작하고, 뒤로 가기도 맨 위에서 시작한다', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    const spans = await chapterSpans(page);
    await scrollToY(page, (spans[1]?.top ?? 0) + 800);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(3000);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByRole('link', { name: 'Get Started' }).click();
    await expect(page).toHaveURL(/\/enter$/);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'TÓME' })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('스토리를 일정 속도로 스크롤하는 동안의 프레임 시간을 잰다(참고값)', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('load');
    const spans = await chapterSpans(page);
    const first = spans[0];
    const last = spans[spans.length - 1];
    if (!first || !last) throw new Error('장이 없다');
    await scrollToY(page, first.top - 600);
    await page.evaluate(() => {
      const frames: number[] = [];
      let previous = performance.now();
      let running = true;
      const tick = (now: number) => {
        frames.push(now - previous);
        previous = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as unknown as { __stopFrames: () => number[] }).__stopFrames = () => {
        running = false;
        return frames;
      };
    });
    const end = last.top + last.pinLength + 400;
    // 마우스 휠로 한 번에 90px 씩, 16ms 마다
    while ((await page.evaluate(() => window.scrollY)) < end) {
      await page.mouse.wheel(0, 90);
      await page.waitForTimeout(16);
    }
    const frames = await page.evaluate(() =>
      (window as unknown as { __stopFrames: () => number[] }).__stopFrames(),
    );
    const sorted = [...frames].sort((a, b) => a - b);
    const average = frames.reduce((sum, value) => sum + value, 0) / frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const stats = {
      frames: frames.length,
      averageMs: Number(average.toFixed(1)),
      p95Ms: Number(p95.toFixed(1)),
    };
    console.log(`[perf] 헤드리스 프레임 시간 ${JSON.stringify(stats)}`);
    await testInfo.attach('frame-times', {
      body: JSON.stringify(stats),
      contentType: 'application/json',
    });
    expect(frames.length).toBeGreaterThan(30);
    await context.close();
  });
});

async function expectStaticStory(page: Page, url: string, shotName: string) {
  await page.goto(url);
  await expect(page.locator('[data-story-mode="static"]')).toHaveCount(1);
  // pin 이 없다: 고정 틀(pin-spacer)이 만들어지지 않는다
  expect(await page.locator('.pin-spacer').count()).toBe(0);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((chapter) => ({
      name: chapter.dataset.chapter,
      top: chapter.getBoundingClientRect().top + window.scrollY,
    })),
  );
  expect(order.map((item) => item.name)).toEqual(['mywork', 'remix', 'derive']);
  expect(order[0]?.top).toBeLessThan(order[1]?.top ?? 0);
  expect(order[1]?.top).toBeLessThan(order[2]?.top ?? 0);
  // 모든 앱 화면 그림이 처음부터 보이는 상태(투명도·변형 없음)다
  const states = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.story-static [data-shot]')].map((el) => {
      const style = getComputedStyle(el);
      return { opacity: style.opacity, transform: style.transform };
    }),
  );
  expect(states.length).toBeGreaterThan(8);
  for (const state of states) expect(state).toEqual({ opacity: '1', transform: 'none' });
  const widths = await windowWidths(page);
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
  // 롤링 띠는 멈춰 있다(복제본 없음)
  expect(await page.locator('[data-roll-clone]').count()).toBe(0);
  if (SHOTS) {
    // 이미지가 지연 로딩이라 위에서 아래로 한 번 훑어 모두 불러온 뒤 찍는다
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLImageElement>('.story img')]
        // 줄 가장자리 밖에 가려진 카드 그림은 지연 로딩이라 불러오지 않는다
        .filter((img) => img.getBoundingClientRect().left < window.innerWidth)
        .every((img) => img.complete),
    );
    await page.locator('.story').screenshot({ path: `${SHOTS}/story-static-${shotName}.png` });
  }
}

test.describe('스크롤 스토리 — 정지 화면 모드', () => {
  test.describe('움직임 줄이기', () => {
    test.use({ reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } });
    test('pin 없이 단계별 최종 그림이 위에서 아래로 차례로 보인다', async ({ page }) => {
      test.setTimeout(60_000);
      await expectStaticStory(page, '/', 'reduced');
    });
  });

  test('?motion=off 면 움직임 줄이기가 아니어도 처음부터 정지 화면 모드다', async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await expectStaticStory(page, '/?motion=off', 'motion-off');
    await context.close();
  });
});
