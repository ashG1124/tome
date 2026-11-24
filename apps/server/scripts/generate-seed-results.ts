// !!! 경고: 이 스크립트는 실제 AI(Cloudflare Workers AI)를 부른다. 호출마다 비용(하루·월 사용 한도)이 든다. !!!
// 실서버의 실제 AI 와 같은 계정 한도를 쓰므로 한 번만 돌리면 된다. 결과 파일을 커밋한 뒤에는 다시 돌리지 않는다.
//
// 2026-11-20 실행해 결과를 커밋함. 텍스트 1순위 모델(@cf/qwen/qwen3-30b-a3b-fp8)이 Cloudflare 폐기(410)라 전부 예비 모델(gemma-4-26b)로 생성됨.
//
// 하는 일
//  - 대체 결과(SampleResult) 5개: 프리셋 문장으로 analyze → research → evidence → draft 를 부르고,
//    검증 기준(buildVerification)과 이미지 1장을 붙여 prisma/seed/sample-results/<프리셋>.json·.jpg·.thumb.jpg 로 저장.
//  - 시드 프로젝트 이미지: 각 프로젝트 prompt 로 image 만 부른다. 프리셋과 같은 첫 프로젝트는 대체 결과 이미지를 복사한다.
//  - 단계 입력·검증 규칙은 생성 서비스(advance.service.ts)와 같게 맞췄다. 프롬프트·파싱은 src/ai provider 가 한다.
//
// 실행(apps/server/.env 에 AI_PROVIDER=workers-ai 와 WORKERS_AI_* 값이 있어야 한다. 값은 로그에 쓰지 않는다)
//   pnpm --filter @tome/server db:seed:generate            # 부를 호출 수만 출력하고 멈춘다
//   pnpm --filter @tome/server db:seed:generate -- --yes   # 실제로 호출
// 옵션
//   --yes       호출 수를 확인했다는 뜻. 없으면 계획만 출력하고 멈춘다.
//   --dry-run   mock provider 로 돈다(비용 0). 시드 폴더를 덮어쓰지 않도록 --out 이 꼭 필요하다.
//   --out <dir> 결과를 쓸 폴더(기본 prisma/seed). 안에 sample-results/ project-images/ 가 만들어진다.
// 이어 하기: 진행 기록(.generate-manifest.json, git 제외)이 있어 중간에 실패해도 다시 돌리면 남은 것만 부른다.
// 이미 실제 결과로 바뀐 파일은 건너뛴다.
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Node,
  NodeSchema,
  NodeSnapshotSchema,
  PROMPT_PRESETS,
  VerificationSchema,
} from '@tome/shared';
import sharp from 'sharp';
import { MockAiProvider, createAiProvider, type AiProvider } from '../src/ai';
import { loadEnv } from '../src/config';
import { assemblePrompt } from '../src/modules/generation/assemble';
import { buildVerification } from '../src/modules/generation/verify';
import { CREATOR_SPECS, needsOwnImage } from '../src/seed/specs';
import { makeThumbnail } from '../src/storage/thumbnail';
import { SAMPLE_RESULTS_DIR } from '../prisma/seed/sample-results';

const TEXT_STAGES = ['analyze', 'research', 'evidence', 'draft'] as const;
type TextStage = (typeof TEXT_STAGES)[number];
const STAGES = [...TEXT_STAGES, 'image'] as const;
type Stage = (typeof STAGES)[number];

/** 장당 목표 크기(1024 JPEG)와 시드 폴더 전체 상한. */
export const IMAGE_TARGET_BYTES = 150 * 1024;
export const SEED_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;
/** 진행 기록이 없을 때 "이미 실제 이미지"로 보는 최소 크기(자리표시 그라데이션은 약 8KB). */
const PLACEHOLDER_MAX_BYTES = 30 * 1024;
const QUALITY_LADDER = [82, 76, 70, 64, 58, 52, 46, 40];

export const DEFAULT_SEED_DIR = join('prisma', 'seed');
const MANIFEST_NAME = '.generate-manifest.json';

// ---- 진행 기록 ----

interface SampleProgress {
  analyze?: { subjectTemplate: string; nodes: Node[] };
  research?: Node[];
  evidence?: Node[];
  draft?: Node[];
  image?: boolean;
  /** 단계별 예비 모델 사용 여부(이어 하기 때 요약에 포함). */
  fallback?: Partial<Record<Stage, boolean>>;
  done?: boolean;
}

interface Manifest {
  version: 1;
  mock: boolean;
  samples: Record<string, SampleProgress>;
  projects: Record<string, boolean>;
  /** 프로젝트 이미지 호출의 예비 모델 사용 여부. */
  projectFallback?: Record<string, boolean>;
}

async function readManifest(path: string, mock: boolean): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Manifest;
    if (parsed.version === 1 && parsed.mock !== mock) {
      throw new Error('MANIFEST_MODE_MISMATCH');
    }
    if (parsed.version === 1) return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'MANIFEST_MODE_MISMATCH') throw error;
  }
  return { version: 1, mock, samples: {}, projects: {} };
}

const writeManifest = (path: string, manifest: Manifest): Promise<void> =>
  writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);

// ---- 계획 ----

export interface RunOptions {
  /** 결과를 쓸 시드 폴더(기본 prisma/seed). */
  seedDir: string;
  /** title·promptVariants 를 읽어 올 기존 대체 결과 폴더. */
  metaDir?: string;
  dryRun: boolean;
  yes: boolean;
  log?: (line: string) => void;
}

export interface RunResult {
  plannedText: number;
  plannedImages: number;
  textCalls: number;
  imageCalls: number;
  failures: number;
  /** --yes 가 없어 계획만 출력하고 멈췄는지 */
  stopped: boolean;
  totalBytes: number;
  overBudget: boolean;
  /** 진행 기록 기준(이어 하기 포함) 예비 모델 사용 호출 수·기록된 호출 수·단계별 횟수 */
  fallbackCalls: number;
  recordedCalls: number;
  fallbackByStage: Record<Stage, number>;
  /** 이번 실행에서 쓰인 모델 이름 */
  models: string[];
}

interface Paths {
  samples: string;
  projects: string;
  manifest: string;
}

const pathsOf = (seedDir: string): Paths => ({
  samples: join(seedDir, 'sample-results'),
  projects: join(seedDir, 'project-images'),
  manifest: join(seedDir, MANIFEST_NAME),
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** json 이 있고 `placeholder: true` 가 아니면 실제 결과로 본다. */
async function sampleIsReal(dir: string, key: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')) as {
      placeholder?: boolean;
    };
    return parsed.placeholder !== true;
  } catch {
    return false;
  }
}

async function projectImageIsReal(dir: string, key: string): Promise<boolean> {
  try {
    return (await stat(join(dir, `${key}.jpg`))).size > PLACEHOLDER_MAX_BYTES;
  } catch {
    return false;
  }
}

interface SamplePlan {
  key: string;
  prompt: string;
  text: TextStage[];
  image: boolean;
}

interface ProjectPlan {
  key: string;
  prompt: string;
  /** 있으면 대체 결과 이미지를 복사한다(호출 없음). */
  presetKey?: string;
  image: boolean;
}

/** 이미 끝난 것을 뺀 남은 일. 호출 수는 여기서 센다. */
async function makePlan(
  paths: Paths,
  manifest: Manifest,
  dryRun: boolean,
): Promise<{ samples: SamplePlan[]; projects: ProjectPlan[]; text: number; images: number }> {
  const samples: SamplePlan[] = [];
  for (const preset of PROMPT_PRESETS) {
    const progress = manifest.samples[preset.key] ?? {};
    const done =
      progress.done === true || (!dryRun && (await sampleIsReal(paths.samples, preset.key)));
    if (done) continue;
    samples.push({
      key: preset.key,
      prompt: preset.prompt,
      text: TEXT_STAGES.filter((stage) => progress[stage] === undefined),
      image: progress.image !== true,
    });
  }
  const projects: ProjectPlan[] = [];
  for (const creator of CREATOR_SPECS) {
    for (const project of creator.projects) {
      // 다른 프로젝트 이미지를 같이 쓰는 것(쇼케이스·파생)은 만들지 않는다.
      if (!needsOwnImage(project)) continue;
      const done =
        manifest.projects[project.key] === true ||
        (!dryRun && (await projectImageIsReal(paths.projects, project.key)));
      if (done) continue;
      projects.push({
        key: project.key,
        prompt: project.prompt,
        ...(project.presetKey ? { presetKey: project.presetKey } : {}),
        image: project.presetKey === undefined,
      });
    }
  }
  return {
    samples,
    projects,
    text: samples.reduce((n, s) => n + s.text.length, 0),
    images: samples.filter((s) => s.image).length + projects.filter((p) => p.image).length,
  };
}

// ---- 단계 실행(advance.service.ts 의 runText 와 같은 입력·검증) ----

interface TextOutput {
  fallbackUsed: boolean;
  model: string;
  nodes: Node[];
  subjectTemplate?: string;
}

async function runTextStage(
  ai: AiProvider,
  stage: TextStage,
  prompt: string,
  prior: readonly Node[],
): Promise<TextOutput> {
  const input = { prompt, nodes: prior };
  const output: TextOutput = { nodes: [], fallbackUsed: false, model: '' };
  if (stage === 'analyze') {
    const result = await ai.analyze(input);
    output.fallbackUsed = result.fallbackUsed;
    output.model = result.model;
    const { subjectTemplate, nodes } = result.value;
    if (typeof subjectTemplate !== 'string' || subjectTemplate.trim() === '') {
      throw new Error('AI_OUTPUT_INVALID');
    }
    output.nodes = nodes;
    output.subjectTemplate = subjectTemplate;
  } else {
    const result = await ai[stage](input);
    output.fallbackUsed = result.fallbackUsed;
    output.model = result.model;
    output.nodes = result.value;
  }
  const parsed = NodeSchema.array().safeParse(output.nodes);
  // 노드 0개는 실패. id 는 단계를 넘어서도 겹치면 안 된다.
  const ids = new Set([...prior, ...(parsed.success ? parsed.data : [])].map((n) => n.id));
  if (
    !parsed.success ||
    parsed.data.length === 0 ||
    ids.size !== prior.length + parsed.data.length
  ) {
    throw new Error('AI_OUTPUT_INVALID');
  }
  output.nodes = parsed.data;
  return output;
}

// ---- 이미지 저장 ----

/** 1024 이내 JPEG. 목표 크기 안에 들어올 때까지 quality 를 내린다. */
export async function encodeFull(
  bytes: Uint8Array,
  targetBytes: number = IMAGE_TARGET_BYTES,
): Promise<Uint8Array> {
  let last: Buffer = Buffer.alloc(0);
  for (const quality of QUALITY_LADDER) {
    last = await sharp(bytes)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (last.length <= targetBytes) break;
  }
  return new Uint8Array(last);
}

async function saveImage(
  dir: string,
  key: string,
  raw: Uint8Array,
): Promise<{ full: number; thumb: number }> {
  const full = await encodeFull(raw);
  const thumb = await makeThumbnail(full);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.jpg`), full);
  await writeFile(join(dir, `${key}.thumb.jpg`), thumb);
  return { full: full.length, thumb: thumb.length };
}

const kb = (bytes: number): string => `${Math.round(bytes / 1024)}KB`;

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const name of await readdir(dir)) total += (await stat(join(dir, name))).size;
  } catch {
    // 폴더가 없으면 0
  }
  return total;
}

/** 프리셋과 같은 첫 프로젝트는 대체 결과 이미지를 그대로 복사한다. */
async function syncPresetCopies(paths: Paths, manifest: Manifest): Promise<number> {
  let copied = 0;
  for (const creator of CREATOR_SPECS) {
    for (const project of creator.projects) {
      if (!project.presetKey || !needsOwnImage(project)) continue;
      const source = join(paths.samples, `${project.presetKey}.jpg`);
      if (
        !(await exists(source)) ||
        !(await sampleIsDoneOnDisk(paths, manifest, project.presetKey))
      ) {
        continue;
      }
      await mkdir(paths.projects, { recursive: true });
      await copyFile(source, join(paths.projects, `${project.key}.jpg`));
      await copyFile(
        join(paths.samples, `${project.presetKey}.thumb.jpg`),
        join(paths.projects, `${project.key}.thumb.jpg`),
      );
      manifest.projects[project.key] = true;
      copied += 1;
    }
  }
  return copied;
}

const sampleIsDoneOnDisk = async (
  paths: Paths,
  manifest: Manifest,
  key: string,
): Promise<boolean> =>
  manifest.samples[key]?.done === true || (await sampleIsReal(paths.samples, key));

/** 전체 용량이 상한을 넘으면 큰 JPEG 부터 한 단계씩 다시 인코딩한다. */
async function shrinkToBudget(paths: Paths, limit: number, log: (line: string) => void) {
  for (let round = 1; round <= 5; round += 1) {
    const total = (await dirBytes(paths.samples)) + (await dirBytes(paths.projects));
    if (total <= limit) return;
    log(`[budget] ${kb(total)} > ${kb(limit)}, lowering quality (round ${round})`);
    for (const dir of [paths.samples, paths.projects]) {
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        if (!name.endsWith('.jpg') || name.endsWith('.thumb.jpg')) continue;
        const bytes = new Uint8Array(await readFile(join(dir, name)));
        const smaller = await encodeFull(bytes, Math.floor(bytes.length * 0.85));
        if (smaller.length >= bytes.length) continue;
        await writeFile(join(dir, name), smaller);
        await writeFile(
          join(dir, name.replace(/\.jpg$/, '.thumb.jpg')),
          await makeThumbnail(smaller),
        );
      }
    }
  }
}

// ---- 본체 ----

interface ExistingMeta {
  title: string;
  promptVariants: string[];
}

async function readMeta(dir: string, key: string): Promise<ExistingMeta> {
  const parsed = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')) as ExistingMeta;
  return { title: parsed.title, promptVariants: parsed.promptVariants };
}

const errorCode = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) return error.message;
  return 'UNKNOWN';
};

export async function runGenerate(options: RunOptions, ai: AiProvider): Promise<RunResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const paths = pathsOf(options.seedDir);
  const metaDir = options.metaDir ?? SAMPLE_RESULTS_DIR;
  await mkdir(options.seedDir, { recursive: true });
  const manifest = await readManifest(paths.manifest, options.dryRun);

  const plan = await makePlan(paths, manifest, options.dryRun);
  log(`Plan: text calls ${plan.text}, image calls ${plan.images} (provider: ${ai.name})`);
  for (const s of plan.samples) {
    log(`  sample ${s.key}: text ${s.text.length}, image ${s.image ? 1 : 0}`);
  }
  for (const p of plan.projects) {
    log(
      `  project ${p.key}: image ${p.image ? 1 : 0}${p.presetKey ? ` (copy of ${p.presetKey})` : ''}`,
    );
  }
  const result: RunResult = {
    plannedText: plan.text,
    plannedImages: plan.images,
    textCalls: 0,
    imageCalls: 0,
    failures: 0,
    stopped: false,
    totalBytes: 0,
    overBudget: false,
    fallbackCalls: 0,
    recordedCalls: 0,
    fallbackByStage: { analyze: 0, research: 0, evidence: 0, draft: 0, image: 0 },
    models: [],
  };
  const models = new Set<string>();
  if (!options.yes) {
    log('Stopped: add --yes to run these calls.');
    result.stopped = true;
    return result;
  }

  for (const sample of plan.samples) {
    const progress = (manifest.samples[sample.key] ??= {});
    let stage: string = 'text';
    try {
      for (const name of TEXT_STAGES) {
        stage = name;
        if (progress[name] !== undefined) continue;
        const prior = priorNodes(progress, TEXT_STAGES.indexOf(name));
        result.textCalls += 1;
        const out = await runTextStage(ai, name, sample.prompt, prior);
        models.add(out.model);
        (progress.fallback ??= {})[name] = out.fallbackUsed;
        if (name === 'analyze') {
          progress.analyze = { subjectTemplate: out.subjectTemplate!, nodes: out.nodes };
        } else {
          progress[name] = out.nodes;
        }
        await writeManifest(paths.manifest, manifest);
      }
      const nodes = priorNodes(progress);
      const subjectTemplate = progress.analyze!.subjectTemplate;
      const snapshot = NodeSnapshotSchema.parse({ schemaVersion: 1, subjectTemplate, nodes });
      const verification = VerificationSchema.parse(buildVerification(snapshot.nodes));
      stage = 'image';
      let sizes = { full: 0, thumb: 0 };
      if (!progress.image) {
        const { assembledPrompt } = assemblePrompt(subjectTemplate, snapshot.nodes);
        result.imageCalls += 1;
        const generated = await ai.image({ assembledPrompt, mode: 'generate' });
        sizes = await saveImage(paths.samples, sample.key, generated.value.bytes);
        models.add(generated.model);
        (progress.fallback ??= {}).image = generated.fallbackUsed;
        progress.image = true;
        await writeManifest(paths.manifest, manifest);
      }
      stage = 'write';
      const meta = await readMeta(metaDir, sample.key);
      const file = {
        scenarioKey: sample.key,
        title: meta.title,
        promptVariants: meta.promptVariants,
        nodes: snapshot,
        verification,
      };
      await writeFile(
        join(paths.samples, `${sample.key}.json`),
        `${JSON.stringify(file, null, 2)}\n`,
      );
      progress.done = true;
      await writeManifest(paths.manifest, manifest);
      log(
        `[sample] ${sample.key}: ok, nodes ${snapshot.nodes.length}, image ${kb(sizes.full)} / thumb ${kb(sizes.thumb)}, fallback ${Object.values(progress.fallback ?? {}).some(Boolean)}`,
      );
    } catch (error) {
      result.failures += 1;
      log(`[sample] ${sample.key}: FAILED at ${stage} (${errorCode(error)})`);
    }
  }

  for (const project of plan.projects) {
    if (!project.image) continue;
    try {
      result.imageCalls += 1;
      const generated = await ai.image({ assembledPrompt: project.prompt, mode: 'generate' });
      const sizes = await saveImage(paths.projects, project.key, generated.value.bytes);
      models.add(generated.model);
      (manifest.projectFallback ??= {})[project.key] = generated.fallbackUsed;
      manifest.projects[project.key] = true;
      await writeManifest(paths.manifest, manifest);
      log(
        `[project] ${project.key}: ok, image ${kb(sizes.full)} / thumb ${kb(sizes.thumb)}, fallback ${generated.fallbackUsed}`,
      );
    } catch (error) {
      result.failures += 1;
      log(`[project] ${project.key}: FAILED at image (${errorCode(error)})`);
    }
  }

  // 대체 결과 이미지를 프리셋 첫 프로젝트에 복사한 뒤 용량을 맞추고, 줄였으면 다시 복사한다.
  await syncPresetCopies(paths, manifest);
  await shrinkToBudget(paths, SEED_TOTAL_LIMIT_BYTES, log);
  const copied = await syncPresetCopies(paths, manifest);
  await writeManifest(paths.manifest, manifest);
  if (copied > 0) log(`[project] copied ${copied} preset images from sample results`);

  result.totalBytes = (await dirBytes(paths.samples)) + (await dirBytes(paths.projects));
  result.overBudget = result.totalBytes > SEED_TOTAL_LIMIT_BYTES;
  log(
    `Done: text calls ${result.textCalls}, image calls ${result.imageCalls}, failures ${result.failures}, seed size ${kb(result.totalBytes)}${result.overBudget ? ' (OVER LIMIT)' : ''}`,
  );
  for (const progress of Object.values(manifest.samples)) {
    for (const stage of STAGES) {
      const used = progress.fallback?.[stage];
      if (used === undefined) continue;
      result.recordedCalls += 1;
      if (used) {
        result.fallbackCalls += 1;
        result.fallbackByStage[stage] += 1;
      }
    }
  }
  for (const used of Object.values(manifest.projectFallback ?? {})) {
    result.recordedCalls += 1;
    if (used) {
      result.fallbackCalls += 1;
      result.fallbackByStage.image += 1;
    }
  }
  result.models = [...models].filter((m) => m !== '').sort();
  const byStage = STAGES.map((stage) => `${stage} ${result.fallbackByStage[stage]}`).join(', ');
  log(`fallback used: ${result.fallbackCalls}/${result.recordedCalls} (${byStage})`);
  log(`models: ${result.models.join(', ') || '-'}`);
  return result;
}

/** 앞 단계들의 노드를 모은다(`upTo` 를 안 주면 네 단계 전부). */
function priorNodes(progress: SampleProgress, upTo: number = TEXT_STAGES.length): Node[] {
  return TEXT_STAGES.slice(0, upTo).flatMap(
    (name) => (name === 'analyze' ? progress.analyze?.nodes : progress[name]) ?? [],
  );
}

// ---- 명령줄 ----

function parseArgs(argv: string[]): { dryRun: boolean; yes: boolean; out?: string } {
  const args = argv.filter((a) => a !== '--');
  const outIndex = args.indexOf('--out');
  return {
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes'),
    ...(outIndex >= 0 && args[outIndex + 1] ? { out: args[outIndex + 1]! } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun && !args.out) {
    console.error('--dry-run needs --out <dir> so mock results never overwrite the seed folder.');
    process.exitCode = 1;
    return;
  }
  let ai: AiProvider;
  if (args.dryRun) {
    ai = new MockAiProvider();
  } else {
    let env;
    try {
      env = loadEnv();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Invalid environment variables');
      process.exitCode = 1;
      return;
    }
    if (env.AI_PROVIDER !== 'workers-ai') {
      console.log('AI_PROVIDER is not workers-ai. Nothing to do.');
      return;
    }
    ai = createAiProvider(env);
  }
  const result = await runGenerate(
    { seedDir: args.out ?? DEFAULT_SEED_DIR, dryRun: args.dryRun, yes: args.yes },
    ai,
  );
  if (result.failures > 0 || result.overBudget) process.exitCode = 1;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed result generation failed:', errorCode(error));
    process.exitCode = 1;
  });
}
