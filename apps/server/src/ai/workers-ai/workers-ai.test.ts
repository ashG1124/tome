import type { Node } from '@tome/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common';
import { MODELS } from '../models';
import { evaluateStage, OutputViolation } from './normalize';
import { buildUserMessage, sniffImageType, WorkersAiProvider } from './workers-ai.provider';
import type { RunLog } from './runner';

const ACCOUNT = 'acct-123';
const TOKEN = 'sekret-token-xyz';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ---- 가짜 fetch ----

interface Call {
  url: string;
  headers: Record<string, string>;
  /** JSON 본문이면 객체, FormData 면 FormData */
  body: unknown;
}
type Handler = (call: Call, signal: AbortSignal | undefined) => Response | Promise<Response>;

function fakeFetch(handlers: Handler[]) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    const call: Call = {
      url: String(input),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof body === 'string' ? JSON.parse(body) : body,
    };
    calls.push(call);
    const handler = handlers[calls.length - 1] ?? handlers[handlers.length - 1]!;
    return handler(call, init?.signal ?? undefined);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const textOk =
  (content: unknown, neurons?: string): Handler =>
  () =>
    json(
      {
        success: true,
        result: {
          choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
        },
      },
      neurons ? { headers: { 'cf-ai-neurons': neurons } } : {},
    );
const httpError =
  (status: number, message = 'oops'): Handler =>
  () =>
    json({ success: false, errors: [{ code: 1, message }] }, { status });
/** 신호를 받을 때까지 끝나지 않는 호출 */
const hang: Handler = (_call, signal) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const imageOk =
  (bytes: Uint8Array, neurons?: string): Handler =>
  () =>
    json(
      { success: true, result: { image: Buffer.from(bytes).toString('base64') } },
      neurons ? { headers: { 'cf-ai-neurons': neurons } } : {},
    );

// ---- 출력 예 ----

const pad = (extra: Record<string, unknown> = {}) => ({
  x: 2,
  y: -1,
  xAxis: ['calm', 'energetic'],
  yAxis: ['dry', 'wet'],
  ...extra,
});
const analyzeRaw = (padOverride: Record<string, unknown> = {}) => ({
  subject_template: '{k1} over {k2}, {k3}',
  keywords: [
    { id: 'k1', text: 'lighthouse', weight: 9, pad: pad(padOverride) },
    { id: 'k2', text: 'stormy sea', weight: 6, pad: pad(padOverride) },
    { id: 'k3', text: 'no text', weight: 8, pad: pad(padOverride) },
  ],
});
const researchRaw = {
  data_types: ['coastal photography', 'film stills'],
  priorities: [
    { id: 's1', text: 'light over form', parent_ids: ['k1'] },
    { id: 's2', text: 'sea texture', parent_ids: ['k2', 'k9'] },
  ],
};
const evidenceRaw = {
  evidence: [
    {
      id: 'e1',
      text: 'Lighthouses are shot at dusk.',
      parent_ids: ['k1', 's1'],
      source_type: 'model_knowledge',
    },
    {
      id: 'e2',
      text: 'Storm waves are white-capped.',
      parent_ids: ['s2'],
      source_type: 'model_knowledge',
    },
  ],
};
const draftRaw = {
  attributes: [
    { id: 'a1', category: 'lighting', text: 'dusk light', weight: 6, parent_ids: ['e1'] },
    { id: 'a2', category: 'water', text: 'white-capped waves', parent_ids: ['e2', 'e1'] },
    { id: 'a3', category: 'mood', text: 'moody', weight: 3, parent_ids: ['e2'] },
  ],
};

function provider(handlers: Handler[], extra: { stageBudgetMs?: number } = {}) {
  const { impl, calls } = fakeFetch(handlers);
  const logs: RunLog[] = [];
  const instance = new WorkersAiProvider({
    accountId: ACCOUNT,
    apiToken: TOKEN,
    fetch: impl,
    log: (entry) => logs.push(entry),
    ...extra,
  });
  return { instance, calls, logs };
}

const input = { prompt: 'a lighthouse in a storm, no text', nodes: [] as Node[] };

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error('expected an AppError');
}

// 앞 단계 노드 준비(정규화 결과를 그대로 쓴다)
const analyzed = evaluateStage('analyze', analyzeRaw(), []);
const researched = evaluateStage('research', researchRaw, analyzed.nodes);
const evidenced = evaluateStage('evidence', evidenceRaw, [...analyzed.nodes, ...researched.nodes]);

describe('WorkersAiProvider text stages', () => {
  it('(a) calls the primary model once with the expected request', async () => {
    const { instance, calls, logs } = provider([textOk(analyzeRaw(), '3.5')]);
    const result = await instance.analyze(input);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODELS.textPrimary}`,
    );
    expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
    const body = call.body as {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      response_format: { type: string; json_schema: { strict: boolean; name: string } };
      chat_template_kwargs?: unknown;
    };
    expect(body.messages[1]!.content.endsWith('\n\n/no_think')).toBe(true);
    expect(body.messages[1]!.content).toContain('User request:\na lighthouse in a storm, no text');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema).toMatchObject({ strict: true, name: 'stage1' });
    expect(body.max_tokens).toBe(2048);
    expect(body.chat_template_kwargs).toBeUndefined();

    expect(result).toMatchObject({
      provider: 'workers-ai',
      model: MODELS.textPrimary,
      fallbackUsed: false,
      neurons: 3.5,
    });
    expect(result.value.subjectTemplate).toBe('{k1} over {k2}, {k3}');
    expect(result.value.nodes.map((n) => n.id)).toEqual(['k1', 'k2', 'k3']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      stage: 'analyze',
      model: MODELS.textPrimary,
      status: 200,
      outcome: 'ok',
    });
  });

  it('accepts result.response as an object or a fenced string', async () => {
    const asObject: Handler = () => json({ success: true, result: { response: analyzeRaw() } });
    const fenced: Handler = () =>
      json({
        success: true,
        result: { response: '```json\n' + JSON.stringify(analyzeRaw()) + '\n```' },
      });
    for (const handler of [asObject, fenced]) {
      const { instance } = provider([handler]);
      expect((await instance.analyze(input)).fallbackUsed).toBe(false);
    }
  });

  it('(b) retries the primary once, then falls back to gemma', async () => {
    const { instance, calls } = provider([
      httpError(500),
      httpError(500),
      textOk(analyzeRaw(), '1.25'),
    ]);
    const result = await instance.analyze(input);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toContain(MODELS.textPrimary);
    expect(calls[1]!.url).toContain(MODELS.textPrimary);
    expect(calls[2]!.url).toContain(MODELS.textFallback);
    const gemma = calls[2]!.body as {
      messages: Array<{ content: string }>;
      chat_template_kwargs: unknown;
    };
    expect(gemma.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(gemma.messages[1]!.content).not.toContain('/no_think');
    expect(result).toMatchObject({ model: MODELS.textFallback, fallbackUsed: true, neurons: 1.25 });
  });

  it('(b2) a retry that succeeds is not a fallback', async () => {
    const { instance, calls } = provider([httpError(502), textOk(analyzeRaw())]);
    const result = await instance.analyze(input);
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ model: MODELS.textPrimary, fallbackUsed: false });
  });

  it('(c) fails with AI_OUTPUT_INVALID when every attempt violates the schema', async () => {
    const bad = textOk({ subject_template: 'x', keywords: [] });
    const { instance, calls } = provider([bad]);
    expect(await errorCode(instance.analyze(input))).toBe('AI_OUTPUT_INVALID');
    expect(calls).toHaveLength(3);
  });

  it('treats unparsable JSON and finish_reason=length as output violations', async () => {
    const notJson: Handler = () =>
      json({
        success: true,
        result: { choices: [{ message: { content: 'nope {' }, finish_reason: 'stop' }] },
      });
    const truncated: Handler = () =>
      json({
        success: true,
        result: {
          choices: [
            { message: { content: JSON.stringify(analyzeRaw()) }, finish_reason: 'length' },
          ],
        },
      });
    for (const handler of [notJson, truncated]) {
      const { instance } = provider([handler]);
      expect(await errorCode(instance.analyze(input))).toBe('AI_OUTPUT_INVALID');
    }
  });

  it('(d) falls back to the default axes when only the axis names stay wrong', async () => {
    const wrong = textOk(analyzeRaw({ xAxis: ['  ', '[ ]'] }));
    const { instance, calls } = provider([wrong]);
    const result = await instance.analyze(input);
    expect(calls).toHaveLength(3);
    for (const node of result.value.nodes) {
      expect(node.pad?.xAxis).toEqual(['Textured', 'Smooth']);
      expect(node.pad?.yAxis).toEqual(['dry', 'wet']);
    }
    expect(result.fallbackUsed).toBe(true);
  });

  it('(d2) a later attempt with valid axes wins over the default axes', async () => {
    const { instance, calls } = provider([
      textOk(analyzeRaw({ yAxis: ['a1', 'b'] })),
      textOk(analyzeRaw()),
    ]);
    const result = await instance.analyze(input);
    expect(calls).toHaveLength(2);
    expect(result.value.nodes[0]!.pad?.yAxis).toEqual(['dry', 'wet']);
  });

  it('(d3) an axis fix is not applied when the last attempt is a hard violation', async () => {
    const { instance } = provider([
      textOk(analyzeRaw({ xAxis: ['1', '2'] })),
      textOk(analyzeRaw({ xAxis: ['1', '2'] })),
      textOk({ nope: true }),
    ]);
    expect(await errorCode(instance.analyze(input))).toBe('AI_OUTPUT_INVALID');
  });

  it('(e) fails with AI_TIMEOUT when the stage budget runs out', async () => {
    const { instance, calls, logs } = provider([hang], { stageBudgetMs: 60 });
    const started = Date.now();
    expect(await errorCode(instance.analyze(input))).toBe('AI_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
    // 시간 초과가 난 모델은 같은 모델 재시도를 건너뛰고, 예산이 없어 폴백도 못 한다.
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(logs[0]!.outcome).toBe('failed:timeout');
  });

  it('(e2) ends the call even when the fetch ignores the abort signal', async () => {
    const stuck: Handler = () => new Promise<Response>(() => undefined);
    const { instance } = provider([stuck], { stageBudgetMs: 50 });
    expect(await errorCode(instance.analyze(input))).toBe('AI_TIMEOUT');
  });

  it('(f) maps 429 on every attempt to AI_UNAVAILABLE', async () => {
    const { instance, calls } = provider([httpError(429, 'rate limited')]);
    expect(await errorCode(instance.analyze(input))).toBe('AI_UNAVAILABLE');
    expect(calls).toHaveLength(3);
  });

  it('maps network errors to AI_UNAVAILABLE', async () => {
    const down: Handler = () => {
      throw new TypeError('fetch failed');
    };
    const { instance } = provider([down]);
    expect(await errorCode(instance.analyze(input))).toBe('AI_UNAVAILABLE');
  });

  it('(g) maps a safety-filter message to SAFETY_BLOCKED', async () => {
    const { instance } = provider([httpError(400, 'Input flagged by NSFW filter')]);
    expect(await errorCode(instance.analyze(input))).toBe('SAFETY_BLOCKED');
  });

  it('reports the code of the LAST failure', async () => {
    const { instance } = provider([httpError(500), httpError(500), textOk({ bad: 1 })]);
    expect(await errorCode(instance.analyze(input))).toBe('AI_OUTPUT_INVALID');
  });

  it('runs research, evidence and draft with the earlier stages as input', async () => {
    const r = provider([textOk(researchRaw)]);
    const research = await r.instance.research({ prompt: 'p', nodes: analyzed.nodes });
    expect(research.value.map((n) => n.id)).toEqual(['d1', 'd2', 's1', 's2']);
    const researchUser = (r.calls[0]!.body as { messages: Array<{ content: string }> }).messages[1]!
      .content;
    expect(researchUser).toContain('"stage1"');
    expect(researchUser).not.toContain('"stage2"');

    const e = provider([textOk(evidenceRaw)]);
    const evidence = await e.instance.evidence({
      prompt: 'p',
      nodes: [...analyzed.nodes, ...researched.nodes],
    });
    expect(evidence.value.map((n) => n.id)).toEqual(['e1', 'e2']);

    const d = provider([textOk(draftRaw)]);
    const draft = await d.instance.draft({
      prompt: 'p',
      nodes: [...analyzed.nodes, ...researched.nodes, ...evidenced.nodes],
    });
    expect(draft.value.map((n) => n.id)).toEqual(['a1', 'a2', 'a3']);
    const draftUser = (d.calls[0]!.body as { messages: Array<{ content: string }> }).messages[1]!
      .content;
    expect(draftUser).toContain('"stage3"');
  });
});

describe('analyze subject_template validation', () => {
  const run = (raw: unknown) => () => evaluateStage('analyze', raw, []);
  const withTemplate = (subject_template: string, texts?: string[]) => ({
    subject_template,
    keywords: (texts ?? ['a', 'b', 'c']).map((text, i) => ({
      id: `k${i + 1}`,
      text,
      weight: 5,
      pad: pad(),
    })),
  });

  it('accepts every id exactly once', () => {
    expect(run(withTemplate('{k3} then {k1} and {k2}'))()).toBeTruthy();
  });

  it.each([
    ['a missing placeholder', '{k1} and {k2}'],
    ['a duplicated placeholder', '{k1} {k1} {k2} {k3}'],
    ['an unknown placeholder', '{k1} {k2} {k3} {k4}'],
    ['a template without placeholders', 'just text'],
  ])('rejects %s', (_name, template) => {
    expect(run(withTemplate(template))).toThrow(OutputViolation);
  });

  it('allows a filled subject of exactly 200 characters and rejects 201', () => {
    const texts = ['x'.repeat(60), 'x'.repeat(60), 'x'.repeat(60)];
    expect(run(withTemplate('{k1}{k2}{k3}' + '!'.repeat(20), texts))()).toBeTruthy();
    expect(run(withTemplate('{k1}{k2}{k3}' + '!'.repeat(21), texts))).toThrow(OutputViolation);
  });

  it('rejects Korean text anywhere in the output', () => {
    const raw = withTemplate('{k1} {k2} {k3}', ['a', 'b', '고양이']);
    expect(run(raw)).toThrow(OutputViolation);
  });

  it('rewrites placeholders to the new ids', () => {
    const raw = {
      subject_template: '{x9} near {x7} near {x8}',
      keywords: ['x7', 'x8', 'x9'].map((id) => ({ id, text: id, weight: 5, pad: pad() })),
    };
    expect(evaluateStage('analyze', raw, []).subjectTemplate).toBe('{k3} near {k1} near {k2}');
  });
});

describe('normalization', () => {
  it('(i) re-ids analyze nodes, sets negative, aiInitial, domain and level', () => {
    const raw = analyzeRaw();
    raw.keywords[0]!.id = 'kw-a';
    raw.subject_template = '{kw-a} over {k2}, {k3}';
    const { nodes } = evaluateStage('analyze', raw, []);
    expect(nodes.map((n) => n.id)).toEqual(['k1', 'k2', 'k3']);
    expect(nodes[0]).toMatchObject({
      stage: 'analyze',
      kind: 'keyword',
      enabled: true,
      weight: 9,
      pad: { x: 2, y: -1, xAxis: ['calm', 'energetic'], yAxis: ['dry', 'wet'] },
      negative: false,
      parentIds: [],
      domain: 'intuitive',
      level: 'macro',
      aiInitial: { weight: 9, pad: { x: 2, y: -1 }, enabled: true },
    });
    expect(nodes[2]!.negative).toBe(true); // "no text"
  });

  it('(i) detects negative keywords by their first word', () => {
    const raw = analyzeRaw();
    raw.keywords[0]!.text = 'Without people';
    raw.keywords[1]!.text = 'nothing special'; // "no" 로 시작하지만 단어가 다르다
    const { nodes } = evaluateStage('analyze', raw, []);
    expect(nodes.map((n) => n.negative)).toEqual([true, false, true]);
  });

  it('(i) defaults a missing weight to 5 and a missing pad x/y to 0', () => {
    const raw = analyzeRaw();
    delete (raw.keywords[0] as { weight?: number }).weight;
    delete (raw.keywords[1]!.pad as { x?: number }).x;
    delete (raw.keywords[1]!.pad as { y?: number }).y;
    const { nodes } = evaluateStage('analyze', raw, []);
    expect(nodes[0]!.weight).toBe(5);
    expect(nodes[0]!.aiInitial?.weight).toBe(5);
    expect(nodes[1]!.pad).toMatchObject({ x: 0, y: 0 });
  });

  it('(i) remaps research ids, orders priorities and drops unknown parents', () => {
    const { nodes } = researched;
    expect(nodes.map((n) => `${n.kind}:${n.id}`)).toEqual([
      'dataType:d1',
      'dataType:d2',
      'priority:s1',
      'priority:s2',
    ]);
    expect(nodes[2]).toMatchObject({
      parentIds: ['k1'],
      order: 0,
      aiInitial: { order: 0 },
      domain: 'evidence',
      level: 'micro',
    });
    expect(nodes[3]).toMatchObject({ parentIds: ['k2'], order: 1 }); // k9 는 버려진다
    expect(nodes[0]).toMatchObject({ domain: 'evidence', level: 'macro' });
  });

  it('(i) evidence nodes carry sourceType and tags; draft nodes carry weight, category, aiInitial', () => {
    expect(evidenced.nodes[0]).toMatchObject({
      id: 'e1',
      sourceType: 'model_knowledge',
      parentIds: ['k1', 's1'],
      domain: 'evidence',
      level: 'micro',
    });
    const draft = evaluateStage('draft', draftRaw, evidenced.nodes);
    expect(draft.nodes[1]).toMatchObject({
      id: 'a2',
      kind: 'attribute',
      weight: 5, // 누락 → 기본값
      category: 'water',
      parentIds: ['e2', 'e1'],
      domain: 'intuitive',
      level: 'micro',
      aiInitial: { weight: 5, enabled: true },
    });
  });

  it('rejects an item whose parents are all unknown', () => {
    const raw = {
      ...researchRaw,
      priorities: [researchRaw.priorities[0]!, { id: 's2', text: 't', parent_ids: ['zz'] }],
    };
    expect(() => evaluateStage('research', raw, analyzed.nodes)).toThrow(OutputViolation);
  });

  it('rejects out-of-range numbers and empty lists', () => {
    const raw = analyzeRaw();
    raw.keywords[0]!.weight = 12;
    expect(() => evaluateStage('analyze', raw, [])).toThrow(OutputViolation);
    expect(() => evaluateStage('draft', { attributes: [] }, evidenced.nodes)).toThrow(
      OutputViolation,
    );
  });
});

describe('buildUserMessage', () => {
  it('only passes enabled nodes and orders priorities', () => {
    const nodes = researched.nodes.map((n) => (n.id === 's1' ? { ...n, enabled: false } : n));
    const message = buildUserMessage('evidence', {
      prompt: 'p',
      nodes: [...analyzed.nodes, ...nodes],
    });
    expect(message).toContain('"id":"s2"');
    expect(message).not.toContain('"id":"s1"');
  });
});

describe('WorkersAiProvider image', () => {
  const generate = { assembledPrompt: 'a lighthouse', mode: 'generate' as const };

  it('generates with klein using multipart and no seed', async () => {
    const { instance, calls } = provider([imageOk(PNG, '104.2')]);
    const result = await instance.image(generate);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(MODELS.imagePrimary);
    const form = calls[0]!.body as FormData;
    expect(form.get('prompt')).toBe('a lighthouse');
    expect(form.get('width')).toBe('1024');
    expect(form.get('height')).toBe('1024');
    expect(form.has('seed')).toBe(false);
    expect(form.has('input_image_0')).toBe(false);
    expect(result).toMatchObject({
      provider: 'workers-ai',
      model: MODELS.imagePrimary,
      fallbackUsed: false,
      neurons: 104.2,
    });
    expect(result.value.mimeType).toBe('image/png');
  });

  it('(j) retries klein once, then uses schnell (JSON, steps 4, no seed)', async () => {
    const { instance, calls } = provider([httpError(500), httpError(503), imageOk(PNG, '2')]);
    const result = await instance.image({ ...generate, assembledPrompt: 'x'.repeat(3000) });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.url).toContain(MODELS.imageFallback);
    const body = calls[2]!.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('seed');
    expect(body.steps).toBe(4);
    expect((body.prompt as string).length).toBe(2048);
    expect(calls[2]!.headers['content-type']).toBe('application/json');
    expect(result).toMatchObject({ model: MODELS.imageFallback, fallbackUsed: true });
  });

  it('detects JPEG and PNG by signature and accepts binary responses', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .jpeg()
      .toBuffer();
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    const binary: Handler = () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
    const { instance } = provider([binary]);
    expect((await instance.image(generate)).value.mimeType).toBe('image/jpeg');
  });

  it('treats a missing or undecodable image as an output violation', async () => {
    const noImage: Handler = () => json({ success: true, result: {} });
    const junk = imageOk(new Uint8Array([9, 9, 9, 9]));
    for (const handler of [noImage, junk]) {
      const { instance, calls } = provider([handler]);
      expect(await errorCode(instance.image(generate))).toBe('AI_OUTPUT_INVALID');
      expect(calls).toHaveLength(3);
    }
  });

  it('maps a safety refusal on every image model to SAFETY_BLOCKED', async () => {
    const { instance } = provider([httpError(400, 'NSFW content detected')]);
    expect(await errorCode(instance.image(generate))).toBe('SAFETY_BLOCKED');
  });

  it('edit mode sends the base image and the instruction', async () => {
    const { instance, calls } = provider([imageOk(PNG)]);
    const result = await instance.image({
      assembledPrompt: 'ignored for edit',
      mode: 'edit',
      baseImage: new Uint8Array(PNG),
      editInstruction: 'Edit image 0. Only change this: remove "mist".',
    });
    const form = calls[0]!.body as FormData;
    expect(form.get('prompt')).toBe('Edit image 0. Only change this: remove "mist".');
    expect(form.get('input_image_0')).toBeInstanceOf(Blob);
    expect(result.fallbackUsed).toBe(false);
  });

  it('(k) edit mode retries once and never falls back', async () => {
    const { instance, calls } = provider([httpError(500)]);
    const code = await errorCode(
      instance.image({
        assembledPrompt: 'x',
        mode: 'edit',
        baseImage: new Uint8Array(PNG),
        editInstruction: 'Edit image 0.',
      }),
    );
    expect(code).toBe('AI_UNAVAILABLE');
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.url.includes(MODELS.imagePrimary))).toBe(true);
  });
});

describe('secrets', () => {
  it('(l) never puts the token or account id in errors or logs', async () => {
    const leaky =
      (status: number): Handler =>
      () =>
        json(
          { success: false, errors: [{ message: `bad token ${TOKEN} for ${ACCOUNT}` }] },
          { status },
        );
    const scenarios: Array<(p: WorkersAiProvider) => Promise<unknown>> = [
      (p) => p.analyze(input),
      (p) => p.image({ assembledPrompt: 'x', mode: 'generate' }),
    ];
    for (const run of scenarios) {
      for (const handler of [leaky(500), leaky(400), hang]) {
        const { instance, logs } = provider([handler], { stageBudgetMs: 80 });
        let caught: unknown;
        try {
          await run(instance);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(AppError);
        const dump = JSON.stringify({ message: (caught as Error).message, logs });
        expect(dump).not.toContain(TOKEN);
        expect(dump).not.toContain(ACCOUNT);
        expect(dump).not.toContain('lighthouse'); // 프롬프트 원문
      }
    }
  });
});
