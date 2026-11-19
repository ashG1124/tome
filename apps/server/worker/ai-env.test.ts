import { describe, expect, it } from 'vitest';
import { resolveAiEnv } from './ai-env';

const keys = { WORKERS_AI_ACCOUNT_ID: 'acct', WORKERS_AI_API_TOKEN: 'tok' };

describe('resolveAiEnv', () => {
  it('스위치가 없으면 mock 이고 키를 넘기지 않는다', () => {
    expect(resolveAiEnv({ ...keys })).toEqual({ vars: { AI_PROVIDER: 'mock' } });
  });

  it.each(['mock', 'gemini', '', 'Workers-AI'])('스위치 값 %j 는 mock', (value) => {
    const result = resolveAiEnv({ AI_PROVIDER: value, ...keys });
    expect(result.vars).toEqual({ AI_PROVIDER: 'mock' });
    expect(result.warning).toBeUndefined();
  });

  it('스위치와 키 둘이 다 있으면 실제 AI 를 켜고 키를 넘긴다', () => {
    expect(resolveAiEnv({ AI_PROVIDER: 'workers-ai', ...keys })).toEqual({
      vars: {
        AI_PROVIDER: 'workers-ai',
        WORKERS_AI_ACCOUNT_ID: 'acct',
        WORKERS_AI_API_TOKEN: 'tok',
      },
    });
  });

  it('붙여 넣을 때 섞인 앞뒤 공백·줄바꿈은 지운다', () => {
    const result = resolveAiEnv({
      AI_PROVIDER: 'workers-ai\n',
      WORKERS_AI_ACCOUNT_ID: ' acct ',
      WORKERS_AI_API_TOKEN: 'tok\n',
    });
    expect(result.vars).toEqual({
      AI_PROVIDER: 'workers-ai',
      WORKERS_AI_ACCOUNT_ID: 'acct',
      WORKERS_AI_API_TOKEN: 'tok',
    });
  });

  it('키가 하나 빠지면 mock 으로 돌리고 빠진 이름만 경고한다(값은 담지 않음)', () => {
    const result = resolveAiEnv({ AI_PROVIDER: 'workers-ai', WORKERS_AI_ACCOUNT_ID: 'acct' });
    expect(result.vars).toEqual({ AI_PROVIDER: 'mock' });
    expect(result.warning).toContain('WORKERS_AI_API_TOKEN');
    expect(result.warning).not.toContain('acct');
  });

  it('키가 공백뿐이면 빠진 것으로 본다', () => {
    const result = resolveAiEnv({
      AI_PROVIDER: 'workers-ai',
      WORKERS_AI_ACCOUNT_ID: '  ',
      WORKERS_AI_API_TOKEN: '',
    });
    expect(result.vars).toEqual({ AI_PROVIDER: 'mock' });
    expect(result.warning).toContain('WORKERS_AI_ACCOUNT_ID, WORKERS_AI_API_TOKEN');
  });
});
