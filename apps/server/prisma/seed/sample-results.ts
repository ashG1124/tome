import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeSnapshotSchema, PROMPT_PRESETS, VerificationSchema } from '@tome/shared';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { ObjectStorage } from '../../src/storage';

/** 대체 결과 고정 파일이 있는 폴더(서버를 켠 위치 apps/server 기준). */
export const SAMPLE_RESULTS_DIR = join('prisma', 'seed', 'sample-results');

/** `<presetKey>.json` 의 모양. `placeholder` 같은 그 밖의 필드는 무시한다. */
const SampleFileSchema = z.object({
  scenarioKey: z.string().min(1),
  title: z.string().min(1),
  promptVariants: z.array(z.string()),
  nodes: NodeSnapshotSchema,
  verification: VerificationSchema.nullable().optional(),
});

/** 대체 결과 이미지의 객체 키. */
export const sampleImageKey = (key: string, variant: 'full' | 'thumb'): string =>
  `samples/${key}/${variant}.jpg`;

/**
 * 고정 파일에서 대체 결과를 적재한다(scenarioKey 로 upsert, 여러 번 돌려도 같다).
 * 이미지는 storage 에 올린다. 적재한 개수를 돌려준다.
 */
export async function loadSampleResults(
  prisma: PrismaClient,
  storage: ObjectStorage,
  dir: string = SAMPLE_RESULTS_DIR,
): Promise<number> {
  const present = new Set(await readdir(dir));
  let count = 0;
  for (const preset of PROMPT_PRESETS) {
    const key = preset.key;
    if (!present.has(`${key}.json`)) continue;
    const parsed = SampleFileSchema.parse(
      JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')),
    );
    if (parsed.scenarioKey !== key) throw new Error(`scenarioKey mismatch in ${key}.json`);
    const full = await readFile(join(dir, `${key}.jpg`));
    const thumb = await readFile(join(dir, `${key}.thumb.jpg`));
    const imageKey = sampleImageKey(key, 'full');
    const thumbKey = sampleImageKey(key, 'thumb');
    await storage.put(imageKey, new Uint8Array(full), 'image/jpeg');
    await storage.put(thumbKey, new Uint8Array(thumb), 'image/jpeg');
    const fields = {
      title: parsed.title,
      promptVariants: parsed.promptVariants,
      nodes: parsed.nodes,
      verification: parsed.verification ?? undefined,
      imageKey,
      thumbKey,
    };
    await prisma.sampleResult.upsert({
      where: { scenarioKey: key },
      update: fields,
      create: { scenarioKey: key, ...fields },
    });
    count += 1;
  }
  return count;
}
