import { describe, expect, it } from 'vitest';
import { MockAiProvider } from '../mock-ai.provider';
import { MODELS } from '../models';
import type { RunLog } from './runner';
import { WorkersAiProvider } from './workers-ai.provider';

const ACCOUNT = 'acct-123';
const TOKEN = 'sekret-token-xyz';
const PROMPT = 'a very private prompt about a lighthouse';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: {
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    max_tokens: number;
  };
}

function setup(
  respond: (signal: AbortSignal | undefined) => Response | Promise<Response>,
  budget = 5000,
) {
  const calls: Call[] = [];
  const logs: RunLog[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: JSON.parse(init?.body as string),
    });
    return respond(init?.signal ?? undefined);
  }) as typeof fetch;
  const provider = new WorkersAiProvider({
    accountId: ACCOUNT,
    apiToken: TOKEN,
    fetch: impl,
    guardBudgetMs: budget,
    log: (e) => logs.push(e),
  });
  return { provider, calls, logs };
}

const ok = (response: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ success: true, result: { response } }), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('WorkersAiProvider.checkInput', () => {
  it('reads an object response: safe', async () => {
    const { provider } = setup(() => ok({ safe: true, categories: [] }));
    const r = await provider.checkInput(PROMPT);
    expect(r.value).toEqual({ safe: true, categories: [] });
    expect(r.model).toBe(MODELS.inputGuard);
    expect(r.fallbackUsed).toBe(false);
  });

  it('reads an object response: unsafe with categories', async () => {
    const { provider } = setup(() => ok({ safe: false, categories: ['S1', 'S10'] }));
    expect((await provider.checkInput(PROMPT)).value).toEqual({
      safe: false,
      categories: ['S1', 'S10'],
    });
  });

  it('reads string responses', async () => {
    expect((await setup(() => ok('safe')).provider.checkInput(PROMPT)).value.safe).toBe(true);
    expect((await setup(() => ok('unsafe\nS1')).provider.checkInput(PROMPT)).value).toEqual({
      safe: false,
      categories: ['S1'],
    });
    expect(
      (await setup(() => ok('\n\nunsafe\nS1,s10 ')).provider.checkInput(PROMPT)).value,
    ).toEqual({
      safe: false,
      categories: ['S1', 'S10'],
    });
  });

  it('sends the model URL, temperature 0, bearer token and the prompt as a user message', async () => {
    const { provider, calls } = setup(() => ok('safe'));
    await provider.checkInput(PROMPT);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/meta/llama-guard-3-8b`,
    );
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]!.body.temperature).toBe(0);
    expect(calls[0]!.body.max_tokens).toBe(32);
    expect(calls[0]!.body.messages).toEqual([{ role: 'user', content: PROMPT }]);
  });

  it('uses the cf-ai-neurons header, otherwise a price-based estimate', async () => {
    const withHeader = await setup(() =>
      ok('safe', { 'cf-ai-neurons': '12.5' }),
    ).provider.checkInput(PROMPT);
    expect(withHeader.neurons).toBe(12.5);
    const estimated = await setup(() => ok('safe')).provider.checkInput(PROMPT);
    expect(estimated.neurons).toBeGreaterThan(0);
  });

  it('passes through on HTTP 500 and logs no prompt text', async () => {
    const { provider, calls, logs } = setup(
      () =>
        new Response(JSON.stringify({ success: false, errors: [{ message: PROMPT }] }), {
          status: 500,
        }),
    );
    const r = await provider.checkInput(PROMPT);
    expect(r.value).toEqual({ safe: true, categories: [] });
    expect(calls).toHaveLength(1); // no retry
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      model: MODELS.inputGuard,
      status: 500,
      outcome: 'failed:http',
    });
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain('lighthouse');
    expect(logged).not.toContain(TOKEN);
  });

  it('passes through on an unreadable body or a network error', async () => {
    const bad = setup(() => new Response('not json', { status: 200 }));
    expect((await bad.provider.checkInput(PROMPT)).value.safe).toBe(true);
    expect(bad.logs[0]!.outcome).toBe('failed:unparseable');
    const net = setup(() => Promise.reject(new TypeError('network down')));
    expect((await net.provider.checkInput(PROMPT)).value.safe).toBe(true);
    expect(net.logs[0]!.outcome).toBe('failed:unavailable');
  });

  it('passes through when the call times out', async () => {
    const { provider, logs } = setup(
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
      30,
    );
    const r = await provider.checkInput(PROMPT);
    expect(r.value).toEqual({ safe: true, categories: [] });
    expect(logs[0]!.outcome).toBe('failed:timeout');
  });
});

describe('MockAiProvider.checkInput', () => {
  it('is always safe with zero neurons', async () => {
    const r = await new MockAiProvider().checkInput();
    expect(r.value).toEqual({ safe: true, categories: [] });
    expect(r.neurons).toBe(0);
  });
});
