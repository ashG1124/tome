// 컨테이너에 넘길 AI 환경변수를 Worker 비밀값에서 고른다(#62).
// Cloudflare 모듈을 쓰지 않는 순수 함수라 Vitest 로 시험한다(worker/ai-env.test.ts).
//
// - 스위치 AI_PROVIDER 가 'workers-ai' 이고 키 둘(WORKERS_AI_ACCOUNT_ID·WORKERS_AI_API_TOKEN)이
//   다 있을 때만 실제 AI 를 켠다.
// - 스위치는 켰는데 키가 빠졌으면 서버가 안 켜지는 대신(config/env.ts 가 거부함) mock 으로 돌리고
//   빠진 이름만 경고로 알린다. 전시 중에 서버가 죽지 않게 하려는 것이다.
// - 그 밖의 값(없음·'mock'·오타)은 모두 mock. 실제 AI 를 끌 때는 AI_PROVIDER 를 mock 으로 바꾸면 된다.

export interface AiSecrets {
  AI_PROVIDER?: string;
  WORKERS_AI_ACCOUNT_ID?: string;
  WORKERS_AI_API_TOKEN?: string;
}

export interface AiEnvResult {
  vars: Record<string, string>;
  // 값은 담지 않는다. 빠진 비밀값 이름 같은 설정 문제만 적는다.
  warning?: string;
}

const KEY_NAMES = ['WORKERS_AI_ACCOUNT_ID', 'WORKERS_AI_API_TOKEN'] as const;

export function resolveAiEnv(secrets: AiSecrets): AiEnvResult {
  if (secrets.AI_PROVIDER?.trim() !== 'workers-ai') {
    return { vars: { AI_PROVIDER: 'mock' } };
  }

  const missing = KEY_NAMES.filter((name) => !secrets[name]?.trim());
  if (missing.length > 0) {
    return {
      vars: { AI_PROVIDER: 'mock' },
      warning: `AI_PROVIDER=workers-ai but missing ${missing.join(', ')}; using mock`,
    };
  }

  return {
    vars: {
      AI_PROVIDER: 'workers-ai',
      WORKERS_AI_ACCOUNT_ID: secrets.WORKERS_AI_ACCOUNT_ID!.trim(),
      WORKERS_AI_API_TOKEN: secrets.WORKERS_AI_API_TOKEN!.trim(),
    },
  };
}
