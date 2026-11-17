// 일회성 스크립트: 시드 프로젝트마다 자리표시(placeholder) 이미지 한 장(1024 JPEG + 512 썸네일)을 만든다.
// 글자 없는 단순 그라데이션이다. 실제 AI 생성 이미지로 바꾸는 일은 #62(AI 키) 뒤 후속 Issue 에서 한다.
// 실행: pnpm --filter @tome/server db:seed:images
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { CREATOR_SPECS } from '../src/seed/specs';
import { PROJECT_IMAGES_DIR } from '../src/seed/images';

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

async function main(): Promise<void> {
  await mkdir(PROJECT_IMAGES_DIR, { recursive: true });
  for (const creator of CREATOR_SPECS) {
    for (const project of creator.projects) {
      const from = hslToHex(project.hue, 0.7, 0.6);
      const to = hslToHex((project.hue + 50) % 360, 0.6, 0.28);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/></svg>`;
      const full = await sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
      const thumb = await sharp(full).resize(512, 512).jpeg({ quality: 70 }).toBuffer();
      await writeFile(join(PROJECT_IMAGES_DIR, `${project.key}.jpg`), full);
      await writeFile(join(PROJECT_IMAGES_DIR, `${project.key}.thumb.jpg`), thumb);
    }
  }
  console.log('Wrote placeholder project images.');
}

main().catch((error: unknown) => {
  console.error('Image generation failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
