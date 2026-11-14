import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NodeSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { APP_ENV, parseEnv } from '../config';
import { AiModule } from './ai.module';
import { AI_PROVIDER, type AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';

const input = { prompt: 'a lighthouse', nodes: [] };

describe('MockAiProvider', () => {
  const provider: AiProvider = new MockAiProvider();

  it.each(['analyze', 'research', 'evidence', 'draft'] as const)(
    '%s returns nodes that pass the shared NodeSchema',
    async (stage) => {
      const result = await provider[stage](input);
      const nodes = 'nodes' in result.value ? result.value.nodes : result.value;
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(NodeSchema.safeParse(node).success).toBe(true);
        expect(node.stage).toBe(stage);
      }
    },
  );

  it('returns the same nodes every time and a fresh copy per call', async () => {
    const first = await provider.analyze(input);
    const second = await provider.analyze(input);
    expect(second).toEqual(first);
    first.value.nodes[0]!.text = 'changed';
    expect((await provider.analyze(input)).value.nodes[0]!.text).not.toBe('changed');
  });

  it('keeps node ids unique across stages', async () => {
    const all = [
      ...(await provider.analyze(input)).value.nodes,
      ...(await provider.research(input)).value,
      ...(await provider.evidence(input)).value,
      ...(await provider.draft(input)).value,
    ];
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
  });

  it('uses every keyword id exactly once in the subject template', async () => {
    const { subjectTemplate, nodes } = (await provider.analyze(input)).value;
    const ids = nodes.filter((n) => n.kind === 'keyword').map((n) => n.id);
    for (const id of ids) {
      expect(subjectTemplate.split(`{${id}}`)).toHaveLength(2);
    }
    expect(subjectTemplate.match(/\{k\d+\}/g)).toHaveLength(ids.length);
  });

  it('returns a fixed PNG image', async () => {
    const result = await provider.image({ assembledPrompt: 'x', mode: 'generate' });
    expect(result.value.mimeType).toBe('image/png');
    expect(Array.from(result.value.bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });

  it('reports zero-cost mock metadata', async () => {
    for (const result of [await provider.analyze(input), await provider.draft(input)]) {
      expect(result).toMatchObject({ provider: 'mock', model: 'mock', fallbackUsed: false });
      expect(result.neurons).toBeUndefined();
    }
  });
});

describe('AiModule', () => {
  it('injects MockAiProvider when AI_PROVIDER=mock', async () => {
    const env = parseEnv({ DATABASE_URL: 'postgresql://x', AI_PROVIDER: 'mock' });

    @Global()
    @Module({ providers: [{ provide: APP_ENV, useValue: env }], exports: [APP_ENV] })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, AiModule],
    }).compile();
    expect(moduleRef.get<AiProvider>(AI_PROVIDER).name).toBe('mock');
  });

  it('injects WorkersAiProvider when AI_PROVIDER=workers-ai (credentials come from env)', async () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://x',
      AI_PROVIDER: 'workers-ai',
      WORKERS_AI_ACCOUNT_ID: 'acct',
      WORKERS_AI_API_TOKEN: 'tok',
    });

    @Global()
    @Module({ providers: [{ provide: APP_ENV, useValue: env }], exports: [APP_ENV] })
    class TestConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, AiModule],
    }).compile();
    expect(moduleRef.get<AiProvider>(AI_PROVIDER).name).toBe('workers-ai');
  });
});
