import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ObjectStorage } from '../storage/object-storage';
import { SHOWCASE_CREATOR_ID } from './creators';
import { uploadSeedImages } from './images';
import { answerKeysOf, buildSeedPlan } from './plan';

/** 올린 바이트를 메모리에 남기는 가짜 저장소. */
function memoryStorage() {
  const objects = new Map<string, Uint8Array>();
  const storage: ObjectStorage = {
    put: (key, bytes) => {
      objects.set(key, bytes);
      return Promise.resolve();
    },
    get: (key) => Promise.resolve(objects.get(key)!),
    signedGetUrl: (key) => Promise.resolve(`/signed/${key}`),
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, objects };
}

const solid = (r: number, g: number, b: number) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();

describe('uploadSeedImages', () => {
  const plan = buildSeedPlan();
  let assets: string;

  beforeEach(async () => {
    assets = await mkdtemp(join(tmpdir(), 'tome-seed-assets-'));
  });
  afterEach(async () => {
    await rm(assets, { recursive: true, force: true });
  });

  it('without a design folder: every answer gets the repo image, no avatars', async () => {
    const { storage, objects } = memoryStorage();
    const result = await uploadSeedImages(storage, { assetsDir: join(assets, 'missing') });
    expect(result.figmaProjects).toBe(0);
    expect(result.avatars.size).toBe(0);
    expect(result.objects).toBe(plan.answers.length * 2);
    for (const answer of plan.answers) {
      for (const key of answerKeysOf(answer.id)) expect(objects.has(key), key).toBe(true);
    }
  });

  it('uses design images and avatars that exist and falls back for the rest; derived works follow the source', async () => {
    await mkdir(join(assets, 'projects'), { recursive: true });
    await mkdir(join(assets, 'avatars'), { recursive: true });
    const lamp = await solid(200, 120, 20);
    await writeFile(join(assets, 'projects', 'lamp-orange-desk.jpg'), lamp);
    await writeFile(join(assets, 'avatars', 'julian.jpg'), await solid(10, 10, 10));

    const { storage, objects } = memoryStorage();
    const result = await uploadSeedImages(storage, { assetsDir: assets });

    // teo-1(원작)과 그 파생(julian-11) 이 같은 시안 이미지를 쓴다.
    expect(result.figmaProjects).toBe(2);
    const uses = (key: string) =>
      plan.answers
        .filter((a) => a.projectKey === key)
        .every((a) => Buffer.from(objects.get(answerKeysOf(a.id)[0]!)!).equals(lamp));
    expect(uses('teo-1')).toBe(true);
    expect(uses('julian-11')).toBe(true);
    expect(uses('mara-1')).toBe(false);
    // 썸네일은 원본에서 다시 만든 JPEG 이다.
    const thumb = objects.get(
      answerKeysOf(plan.answers.find((a) => a.projectKey === 'teo-1')!.id)[1]!,
    )!;
    expect((await sharp(thumb).metadata()).format).toBe('jpeg');

    expect([...result.avatars]).toEqual([
      [SHOWCASE_CREATOR_ID, `avatars/${SHOWCASE_CREATOR_ID}.jpg`],
    ]);
    expect(objects.has(`avatars/${SHOWCASE_CREATOR_ID}.jpg`)).toBe(true);
    expect(result.objects).toBe(plan.answers.length * 2 + 1);
  });
});
