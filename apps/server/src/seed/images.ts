import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObjectStorage } from '../storage/object-storage';
import { answerKeysOf, buildSeedPlan } from './plan';

/** 자리표시(placeholder) 이미지 폴더(서버를 켠 위치 apps/server 기준). 프로젝트 키별 한 장을 그 버전들이 같이 쓴다. */
export const PROJECT_IMAGES_DIR = join('prisma', 'seed', 'project-images');

/**
 * 답변마다 따로 키를 잡아 올린다(삭제가 서로 독립). 같은 키에 같은 바이트를 다시 올리므로 여러 번 돌려도 같다.
 * 올린 객체 수를 돌려준다.
 */
export async function uploadSeedImages(
  storage: ObjectStorage,
  dir: string = PROJECT_IMAGES_DIR,
  concurrency = 8,
): Promise<number> {
  const plan = buildSeedPlan();
  const files = new Map<string, { full: Uint8Array; thumb: Uint8Array }>();
  for (const project of plan.projects) {
    files.set(project.key, {
      full: new Uint8Array(await readFile(join(dir, `${project.key}.jpg`))),
      thumb: new Uint8Array(await readFile(join(dir, `${project.key}.thumb.jpg`))),
    });
  }
  const jobs = plan.answers.map((answer) => async () => {
    const file = files.get(answer.projectKey)!;
    const [fullKey, thumbKey] = answerKeysOf(answer.id);
    await storage.put(fullKey!, file.full, 'image/jpeg');
    await storage.put(thumbKey!, file.thumb, 'image/jpeg');
  });
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) {
      const job = jobs[next]!;
      next += 1;
      await job();
    }
  });
  await Promise.all(workers);
  return jobs.length * 2;
}
