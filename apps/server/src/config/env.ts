import { z } from 'zod';

// 지금은 mock 만 허용한다. 실제 공급자는 후속 작업에서 추가한다.
export const AI_PROVIDERS = ['mock'] as const;

export const STORAGE_DRIVERS = ['local', 'r2'] as const;

const R2_REQUIRED = [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

const BaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // 마이그레이션 전용 직접 연결 주소(선택). 런타임에서는 쓰지 않는다.
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AI_PROVIDER: z.enum(AI_PROVIDERS).default('mock'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  APP_VERSION: z.string().min(1).optional(),
  // 관리 API 보호용 토큰(선택). 없으면 관리 API 는 항상 401.
  ADMIN_TOKEN: z.string().min(1).optional(),
  // 이미지 저장소: local(파일) 또는 r2(Cloudflare R2). r2 면 R2_* 넷이 모두 필요하다.
  STORAGE_DRIVER: z.enum(STORAGE_DRIVERS).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).optional(),
  // local 서명 키(선택). 없으면 프로세스를 시작할 때 무작위로 만든다.
  STORAGE_LOCAL_SECRET: z.string().min(1).optional(),
  R2_ENDPOINT: z.url().optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // 이미지 서명 URL 수명(초)
  ASSET_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
});

export const EnvSchema = BaseEnvSchema.superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER !== 'r2') return;
  for (const name of R2_REQUIRED) {
    if (env[name] === undefined) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'Required when STORAGE_DRIVER=r2' });
    }
  }
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
