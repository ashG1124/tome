import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { avatarImageKey, type ObjectStorage } from '../storage/object-storage';
import { makeThumbnail } from '../storage/thumbnail';
import { SEED_CREATORS } from './creators';
import { answerKeysOf, buildSeedPlan } from './plan';
import { figmaImageOf, imageFileKeyOf } from './specs';

/** 실제 생성 이미지 폴더(#112, `db:seed:generate`로 한 번 만들어 커밋)(서버를 켠 위치 apps/server 기준). 프로젝트 키별 한 장을 그 버전들이 같이 쓴다. */
export const PROJECT_IMAGES_DIR = join('prisma', 'seed', 'project-images');

/**
 * 시안 이미지 폴더의 기본 위치(서버를 켠 위치 apps/server 기준): 저장소 맨 위의 자산 저장소 사본 `.tome-assets/seed`.
 * 안에 `projects/<이름>.jpg`·`avatars/<이름>.jpg` 가 있다. 디자인 자산이라 공개 저장소에는 넣지 않는다.
 */
export const DEFAULT_SEED_ASSETS_DIR = join('..', '..', '.tome-assets', 'seed');

export interface SeedImageOptions {
  /** 저장소 대체 이미지 폴더(기본 PROJECT_IMAGES_DIR) */
  dir?: string;
  /** 시안 이미지 폴더. 없거나 파일이 빠졌으면 그 이미지만 대체 이미지로 올린다(프로필 이미지는 건너뛴다) */
  assetsDir?: string | null;
  concurrency?: number;
}

export interface SeedImageResult {
  /** 올린 객체 수 */
  objects: number;
  /** 시안 이미지로 올린 프로젝트 수(나머지는 대체 이미지) */
  figmaProjects: number;
  /** 프로필 이미지를 올린 창작자 id → 객체 키 */
  avatars: Map<string, string>;
}

interface ImageBytes {
  full: Uint8Array;
  thumb: Uint8Array;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 답변 이미지와 프로필 이미지를 저장소에 올린다. 답변마다 따로 키를 잡아 올린다(삭제가 서로 독립).
 * 같은 키에 같은 바이트를 다시 올리므로 여러 번 돌려도 같다.
 */
export async function uploadSeedImages(
  storage: ObjectStorage,
  options: SeedImageOptions = {},
): Promise<SeedImageResult> {
  const dir = options.dir ?? PROJECT_IMAGES_DIR;
  const assetsDir = options.assetsDir ?? null;
  const concurrency = options.concurrency ?? 8;
  const plan = buildSeedPlan();

  // 프로젝트 키 → 이미지 바이트. 시안 이미지가 있으면 그것을, 없으면 저장소 대체 이미지를 쓴다.
  const files = new Map<string, ImageBytes>();
  const cache = new Map<string, ImageBytes>();
  let figmaProjects = 0;
  for (const project of plan.projects) {
    const figma = figmaImageOf(project.spec);
    const figmaPath = figma && assetsDir ? join(assetsDir, 'projects', `${figma}.jpg`) : null;
    let bytes: ImageBytes | undefined;
    if (figmaPath && (await exists(figmaPath))) {
      const cacheKey = `figma:${figma}`;
      bytes = cache.get(cacheKey);
      if (!bytes) {
        const full = new Uint8Array(await readFile(figmaPath));
        bytes = { full, thumb: await makeThumbnail(full) };
        cache.set(cacheKey, bytes);
      }
      figmaProjects += 1;
    } else {
      const fileKey = imageFileKeyOf(project.spec);
      const cacheKey = `repo:${fileKey}`;
      bytes = cache.get(cacheKey);
      if (!bytes) {
        bytes = {
          full: new Uint8Array(await readFile(join(dir, `${fileKey}.jpg`))),
          thumb: new Uint8Array(await readFile(join(dir, `${fileKey}.thumb.jpg`))),
        };
        cache.set(cacheKey, bytes);
      }
    }
    files.set(project.key, bytes);
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

  const avatars = new Map<string, string>();
  if (assetsDir) {
    for (const creator of SEED_CREATORS) {
      if (!creator.avatar) continue;
      const path = join(assetsDir, 'avatars', `${creator.avatar}.jpg`);
      if (!(await exists(path))) continue;
      const key = avatarImageKey(creator.id);
      await storage.put(key, new Uint8Array(await readFile(path)), 'image/jpeg');
      avatars.set(creator.id, key);
    }
  }
  return { objects: jobs.length * 2 + avatars.size, figmaProjects, avatars };
}
