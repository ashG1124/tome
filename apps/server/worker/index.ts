// Cloudflare Worker 진입점 (Issue #21).
// 모든 요청을 컨테이너 인스턴스 하나("main")로 넘긴다.
// 이 파일은 wrangler 가 따로 번들한다. 서버 빌드(tsconfig 의 src)에는 들어가지 않는다.
import { Container, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

type WorkerEnv = {
  TOME_SERVER: Parameters<typeof getContainer>[0];
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  CORS_ORIGIN: string;
};

const secrets = env as unknown as WorkerEnv;

export class TomeServer extends Container {
  defaultPort = 3000;
  // 요청이 없으면 10분 뒤 잠들고, 다음 요청에서 다시 깨어난다.
  sleepAfter = '10m';
  // Worker 비밀값을 컨테이너 환경변수로 넘긴다. 값은 코드·로그에 남기지 않는다.
  // DIRECT_DATABASE_URL 은 없으면 넣지 않는다. 빈 문자열을 넣으면 prisma.config.ts 가
  // DATABASE_URL 로 넘어가지 않고 빈 주소로 마이그레이션을 시도한다.
  envVars: Record<string, string> = {
    DATABASE_URL: secrets.DATABASE_URL,
    ...(secrets.DIRECT_DATABASE_URL ? { DIRECT_DATABASE_URL: secrets.DIRECT_DATABASE_URL } : {}),
    CORS_ORIGIN: secrets.CORS_ORIGIN,
    AI_PROVIDER: 'mock',
    PORT: '3000',
  };
}

export default {
  async fetch(request: Request, workerEnv: WorkerEnv): Promise<Response> {
    // 서버가 실제 접속 IP를 보도록 Cloudflare 가 알려 준 값을 X-Tome-Client-Ip 로 넘긴다.
    // X-Forwarded-For 는 Cloudflare 가 관리하는 헤더라 쓰지 않는다.
    // 사용자가 직접 보낸 X-Tome-Client-Ip 는 덮어쓰거나 지운다(속여서 제한을 피하지 못하게).
    // 헤더 이름은 서버의 src/common/client-ip.middleware.ts 와 같아야 한다.
    const headers = new Headers(request.headers);
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) headers.set('X-Tome-Client-Ip', clientIp);
    else headers.delete('X-Tome-Client-Ip');
    return getContainer(workerEnv.TOME_SERVER, 'main').fetch(new Request(request, { headers }));
  },
};
