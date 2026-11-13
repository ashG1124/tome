import { z } from 'zod';

// 지금은 mock 만 허용한다. 실제 공급자는 후속 작업에서 추가한다.
export const AI_PROVIDERS = ['mock'] as const;

export const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // 마이그레이션 전용 직접 연결 주소(선택). 런타임에서는 쓰지 않는다.
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AI_PROVIDER: z.enum(AI_PROVIDERS).default('mock'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  APP_VERSION: z.string().min(1).optional(),
  // 관리 API 보호용 토큰(선택). 없으면 관리 API 는 항상 401.
  ADMIN_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** 환경변수를 검증한다. 틀린 항목의 이름만 알리고 값은 오류 메시지에 넣지 않는다. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return result.data;
}

/** 로컬 개발용 .env 파일을 읽어 둔다(이미 설정된 값은 덮어쓰지 않는다). 파일이 없으면 넘어간다. */
export function loadEnv(): Env {
  for (const file of ['.env', '../../.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // 파일이 없으면 무시
    }
  }
  return parseEnv(process.env);
}
