import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROMPT_PRESETS } from '@tome/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAiProvider, type AiProvider } from '../ai';
import { loadSampleResults } from '../../prisma/seed/sample-results';
import {
  SEED_TOTAL_LIMIT_BYTES,
  runGenerate,
  type RunOptions,
} from '../../scripts/generate-seed-results';
import { CREATOR_SPECS, needsOwnImage } from './specs';

/** 호출 수를 세는 mock. AI·네트워크 호출은 없다. */
class CountingAi extends MockAiProvider {
  text = 0;
  images = 0;
  failImageOnce = false;
  override analyze(...a: Parameters<MockAiProvider['analyze']>) {
    this.text += 1;
    return super.analyze(...a);
  }
  override research() {
    this.text += 1;
    return super.research();
  }
  override evidence() {
    this.text += 1;
    return super.evidence();
  }
  override draft() {
    this.text += 1;
    return super.draft();
  }
  override image() {
    this.images += 1;
    if (this.failImageOnce) {
      this.failImageOnce = false;
      return Promise.reject(new Error('AI_UNAVAILABLE'));
    }
    return super.image();
  }
}

const OWN_IMAGE_PROJECTS = CREATOR_SPECS.flatMap((c) => c.projects).filter(needsOwnImage);
const PROJECT_COUNT = OWN_IMAGE_PROJECTS.length;
const PRESET_PROJECTS = OWN_IMAGE_PROJECTS.filter((p) => p.presetKey);

describe('generate-seed-results (dry-run, mock provider)', () => {
  let dir: string;
  let lines: string[];
  const options = (extra: Partial<RunOptions> = {}): RunOptions => ({
    seedDir: dir,
    dryRun: true,
    yes: true,
    log: (line) => lines.push(line),
    ...extra,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-seed-gen-'));
    lines = [];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stops after printing the plan when --yes is missing', async () => {
    const ai = new CountingAi();
    const result = await runGenerate(options({ yes: false }), ai);
    expect(result.stopped).toBe(true);
    expect(result.plannedText).toBe(PROMPT_PRESETS.length * 4);
    expect(result.plannedImages).toBe(
      PROMPT_PRESETS.length + PROJECT_COUNT - PRESET_PROJECTS.length,
    );
    expect(ai.text + ai.images).toBe(0);
    expect(await readdir(dir)).toEqual([]);
  });

  it('writes results, reuses preset images, and a second run calls nothing', async () => {
    const ai = new CountingAi();
    const first = await runGenerate(options(), ai);
    expect(first.failures).toBe(0);
    expect(first.textCalls).toBe(PROMPT_PRESETS.length * 4);
    expect(first.imageCalls).toBe(first.plannedImages);
    expect(ai.text).toBe(first.textCalls);
    expect(ai.images).toBe(first.imageCalls);
    expect(first.totalBytes).toBeLessThanOrEqual(SEED_TOTAL_LIMIT_BYTES);

    // 파일이 있고 placeholder 표시가 없다.
    for (const preset of PROMPT_PRESETS) {
      const json = JSON.parse(
        await readFile(join(dir, 'sample-results', `${preset.key}.json`), 'utf8'),
      );
      expect(json).not.toHaveProperty('placeholder');
      expect(json.scenarioKey).toBe(preset.key);
      expect((await stat(join(dir, 'sample-results', `${preset.key}.jpg`))).size).toBeGreaterThan(
        0,
      );
      expect(
        (await stat(join(dir, 'sample-results', `${preset.key}.thumb.jpg`))).size,
      ).toBeGreaterThan(0);
    }
    // 프로젝트 이미지가 모두 있고, 프리셋 첫 프로젝트는 대체 결과와 같은 파일이다.
    for (const project of OWN_IMAGE_PROJECTS) {
      expect((await stat(join(dir, 'project-images', `${project.key}.jpg`))).size).toBeGreaterThan(
        0,
      );
      expect(
        (await stat(join(dir, 'project-images', `${project.key}.thumb.jpg`))).size,
      ).toBeGreaterThan(0);
    }
    for (const project of PRESET_PROJECTS) {
      const a = await readFile(join(dir, 'project-images', `${project.key}.jpg`));
      const b = await readFile(join(dir, 'sample-results', `${project.presetKey}.jpg`));
      expect(a.equals(b)).toBe(true);
    }

    // 결과 json 이 대체 결과 적재 코드의 스키마를 통과한다.
    const upsert = vi.fn().mockResolvedValue({});
    const put = vi.fn().mockResolvedValue(undefined);
    const loaded = await loadSampleResults(
      { sampleResult: { upsert } } as never,
      { put } as never,
      join(dir, 'sample-results'),
    );
    expect(loaded).toBe(PROMPT_PRESETS.length);
    expect(upsert).toHaveBeenCalledTimes(PROMPT_PRESETS.length);

    // 두 번째 실행은 0회.
    const second = await runGenerate(options(), ai);
    expect(second.plannedText + second.plannedImages).toBe(0);
    expect(second.textCalls + second.imageCalls).toBe(0);
    expect(ai.text).toBe(first.textCalls);
    expect(ai.images).toBe(first.imageCalls);
  });

  it('resumes after a failure and only calls what is left', async () => {
    const ai = new CountingAi();
    ai.failImageOnce = true;
    const first = await runGenerate(options(), ai);
    expect(first.failures).toBe(1);
    const textBefore = ai.text;

    const second = await runGenerate(options(), ai);
    expect(second.failures).toBe(0);
    expect(second.textCalls).toBe(0); // 단계 결과는 진행 기록에 남아 있다
    expect(second.imageCalls).toBe(1);
    expect(ai.text).toBe(textBefore);

    const third = await runGenerate(options(), ai);
    expect(third.textCalls + third.imageCalls).toBe(0);
  });

  it('counts fallback use per stage and in the summary line', async () => {
    class FallbackAi extends MockAiProvider {
      override async research() {
        return { ...(await super.research()), fallbackUsed: true, model: 'backup-model' };
      }
    }
    const result = await runGenerate(options(), new FallbackAi());
    expect(result.fallbackByStage.research).toBe(PROMPT_PRESETS.length);
    expect(result.fallbackCalls).toBe(PROMPT_PRESETS.length);
    expect(result.recordedCalls).toBe(
      PROMPT_PRESETS.length * 5 + PROJECT_COUNT - PRESET_PROJECTS.length,
    );
    expect(result.models).toContain('backup-model');
    expect(lines.some((l) => l.startsWith(`fallback used: ${PROMPT_PRESETS.length}/`))).toBe(true);
    expect(lines.some((l) => l.startsWith('[sample]') && l.endsWith('fallback true'))).toBe(true);
    // 이어 하기: 진행 기록에서 같은 횟수가 요약에 다시 나온다.
    const again = await runGenerate(options(), new FallbackAi());
    expect(again.fallbackCalls).toBe(PROMPT_PRESETS.length);
  });

  it('does not log prompts or secrets', async () => {
    await runGenerate(options(), new CountingAi() as AiProvider);
    const log = lines.join('\n');
    for (const preset of PROMPT_PRESETS) expect(log).not.toContain(preset.prompt);
  });
});
