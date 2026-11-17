import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './cases';
import { BLOB_REVIEW_MIN, CHANNEL_TOLERANCE, PASS_MAX, REVIEW_MAX } from './thresholds';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const resultsDir = resolve(here, 'results');
const fileName = (id: string) => id.replaceAll('/', '__');

type Verdict = 'pass' | 'review' | 'fail';

interface SummaryEntry {
  id: string;
  ref: string;
  width: number;
  height: number;
  diffRatio: number;
  diffBox: { x: number; y: number; w: number; h: number } | null;
  largestBlob: number;
  verdict: Verdict;
  note?: string;
  allowedDiff?: { max: number; maxBlob?: number; reason: string };
}

// allowedDiff 가 있으면 그 max 가 pass 상한을, maxBlob(선택)이 덩어리 상한을 대신한다(근거 reason 필수).
// 큰 연결 덩어리는 비율이 pass 여도 review 로 올린다(큰 프레임에서 비율이 묽어지는 것 보강).
function judge(
  diffRatio: number,
  largestBlob: number,
  allowed?: { max: number; maxBlob?: number },
): Verdict {
  const passMax = allowed?.max ?? PASS_MAX;
  let verdict: Verdict = 'pass';
  if (diffRatio > passMax) {
    verdict = allowed === undefined && diffRatio <= REVIEW_MAX ? 'review' : 'fail';
  }
  const blobMax = allowed?.maxBlob ?? BLOB_REVIEW_MIN;
  return verdict === 'pass' && largestBlob > blobMax ? 'review' : verdict;
}

// 케이스마다 json 한 개씩 저장하고 summary.json 은 그 파일들로 다시 만든다(병렬 실행·-g 부분 실행 대비).
function writeSummary() {
  const entries: SummaryEntry[] = [];
  for (const c of cases) {
    try {
      entries.push(JSON.parse(readFileSync(resolve(resultsDir, `${fileName(c.id)}.json`), 'utf8')));
    } catch {
      // 이번에 돌리지 않은 케이스는 건너뛴다.
    }
  }
  writeFileSync(resolve(resultsDir, 'summary.json'), `${JSON.stringify(entries, null, 2)}\n`);
}

mkdirSync(resultsDir, { recursive: true });

for (const c of cases) {
  test(c.id, async ({ page }) => {
    test.skip(!existsSync(resolve(repoRoot, c.ref)), `reference image not found: ${c.ref}`);
    const refBase64 = readFileSync(resolve(repoRoot, c.ref)).toString('base64');

    await page.setViewportSize({ width: c.width, height: c.height });
    await page.goto(`/design-check.html?case=${encodeURIComponent(c.id)}`);
    // React 가 케이스를 그린 뒤에 폰트·setup 을 기다린다(안 그러면 포커스 같은 setup 이 빈 박스에 실행된다).
    await page.waitForFunction(
      () => document.querySelector('[data-testid="design-check-target"]')?.firstElementChild,
    );
    // 글꼴은 처음 글자를 배치할 때 요청된다. 한 프레임 기다린 뒤 ready 를 기다려야 늦게 도착한 글꼴이 섞이지 않는다.
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await document.fonts.ready;
    });
    await page.evaluate(() =>
      (window as unknown as { __designCheckSetup?: () => void }).__designCheckSetup?.(),
    );
    const shot = await page
      .getByTestId('design-check-target')
      .screenshot({ animations: 'disabled' });

    const allowed = c.allowedDiff;
    const labelTemplate =
      `${c.id}  diff {RATIO}%  box {BOX}  blob {BLOB}px` +
      (allowed ? `  (allowed <= ${(allowed.max * 100).toFixed(1)}%: ${allowed.reason})` : '') +
      '   [reference | implementation | diff]';

    const out = await page.evaluate(
      async ({ refB64, implB64, tolerance, template }) => {
        const decode = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          return img;
        };
        const [ref, impl] = await Promise.all([decode(refB64), decode(implB64)]);
        if (ref.naturalWidth !== impl.naturalWidth || ref.naturalHeight !== impl.naturalHeight) {
          return {
            sizeMismatch: `ref ${ref.naturalWidth}x${ref.naturalHeight} vs impl ${impl.naturalWidth}x${impl.naturalHeight}`,
          };
        }
        const w = ref.naturalWidth;
        const h = ref.naturalHeight;
        const pixels = (img: HTMLImageElement) => {
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          const ctx = cv.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, w, h);
        };
        const a = pixels(ref).data;
        const b = pixels(impl).data;
        const diff = new ImageData(w, h);
        const mask = new Uint8Array(w * h);
        let different = 0;
        let x0 = w;
        let y0 = h;
        let x1 = -1;
        let y1 = -1;
        for (let i = 0; i < a.length; i += 4) {
          let d = 0;
          for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k]! - b[i + k]!));
          if (d > tolerance) {
            different++;
            const p = i / 4;
            mask[p] = 1;
            const x = p % w;
            const y = (p - x) / w;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
            diff.data.set([255, 0, 0, 255], i);
          } else {
            // 같은 픽셀은 참조를 흐리게
            for (let k = 0; k < 3; k++) diff.data[i + k] = 255 - (255 - a[i + k]!) * 0.3;
            diff.data[i + 3] = 255;
          }
        }
        const diffRatio = different / (w * h);
        const diffBox = different > 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;

        // 가장 큰 연결 덩어리: 다른 픽셀의 4-이웃 연결 성분 중 최대 픽셀 수
        let largestBlob = 0;
        const stack = new Int32Array(w * h);
        for (let start = 0; start < mask.length; start++) {
          if (mask[start] !== 1) continue;
          let size = 0;
          let top = 0;
          stack[top++] = start;
          mask[start] = 2;
          while (top > 0) {
            const p = stack[--top]!;
            size++;
            const x = p % w;
            const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
            for (const q of neighbors) {
              if (q >= 0 && q < mask.length && mask[q] === 1) {
                mask[q] = 2;
                stack[top++] = q;
              }
            }
          }
          largestBlob = Math.max(largestBlob, size);
        }

        // [참조 | 구현 | 차이] 가로 배치, 위에 라벨 줄
        const GAP = 8;
        const LABEL_H = 22;
        const sheet = document.createElement('canvas');
        sheet.width = w * 3 + GAP * 2;
        sheet.height = h + LABEL_H;
        const ctx = sheet.getContext('2d')!;
        ctx.fillStyle = '#e5e5e5';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.fillStyle = '#111';
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        const boxText = diffBox ? `${diffBox.x},${diffBox.y} ${diffBox.w}x${diffBox.h}` : 'none';
        ctx.fillText(
          template
            .replace('{RATIO}', (diffRatio * 100).toFixed(2))
            .replace('{BOX}', boxText)
            .replace('{BLOB}', String(largestBlob)),
          4,
          LABEL_H / 2,
        );
        ctx.drawImage(ref, 0, LABEL_H);
        ctx.drawImage(impl, w + GAP, LABEL_H);
        const dc = document.createElement('canvas');
        dc.width = w;
        dc.height = h;
        dc.getContext('2d')!.putImageData(diff, 0, 0);
        ctx.drawImage(dc, (w + GAP) * 2, LABEL_H);
        return { diffRatio, diffBox, largestBlob, png: sheet.toDataURL('image/png').split(',')[1] };
      },
      {
        refB64: refBase64,
        implB64: shot.toString('base64'),
        tolerance: CHANNEL_TOLERANCE,
        template: labelTemplate,
      },
    );

    // 3) 크기가 다르면 바로 실패
    if (out.sizeMismatch !== undefined) throw new Error(`size mismatch: ${out.sizeMismatch}`);
    if (out.png === undefined || out.diffRatio === undefined) throw new Error('compare failed');

    const verdict = judge(out.diffRatio, out.largestBlob ?? 0, allowed);
    const entry: SummaryEntry = {
      id: c.id,
      ref: c.ref,
      width: c.width,
      height: c.height,
      diffRatio: Number(out.diffRatio.toFixed(5)),
      diffBox: out.diffBox ?? null,
      largestBlob: out.largestBlob ?? 0,
      verdict,
      ...(verdict === 'review' ? { note: '사람 확인 필요' } : {}),
      ...(allowed ? { allowedDiff: allowed } : {}),
    };
    writeFileSync(resolve(resultsDir, `${fileName(c.id)}.png`), Buffer.from(out.png, 'base64'));
    writeFileSync(resolve(resultsDir, `${fileName(c.id)}.json`), JSON.stringify(entry));
    writeSummary();

    console.log(
      `[design-check] ${c.id} diffRatio=${(out.diffRatio * 100).toFixed(2)}% verdict=${verdict} box=${JSON.stringify(out.diffBox)} blob=${out.largestBlob}px` +
        (verdict === 'review' ? ' — 사람 확인 필요' : '') +
        (allowed ? ` (allowedDiff: ${allowed.reason})` : ''),
    );
    expect(verdict, `diffRatio ${(out.diffRatio * 100).toFixed(2)}% > limit`).not.toBe('fail');
  });
}
