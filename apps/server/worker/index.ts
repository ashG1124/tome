// Cloudflare Worker 진입점 (Issue #21).
// 모든 요청을 컨테이너 인스턴스 하나("main")로 넘긴다.
// 이 파일은 wrangler 가 따로 번들한다. 서버 빌드(tsconfig 의 src)에는 들어가지 않는다.
import { Container, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

type WorkerEnv = {
  TOME_SERVER: Parameters<typeof getContainer>[0];
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  // 관리 API(X-Admin-Token) 보호용. 없으면 관리 API 는 항상 401 이다.
  ADMIN_TOKEN?: string;
  // 배포할 때 `--var APP_VERSION:<커밋 해시>`로 넣는다. /health 의 version 으로 보인다.
  APP_VERSION?: string;
};

const secrets = env as unknown as WorkerEnv;

export class TomeServer extends Container {
  defaultPort = 3000;
  // 요청이 없으면 10분 뒤 잠들고, 다음 요청에서 다시 깨어난다.
  sleepAfter = '10m';
  // Worker 비밀값을 컨테이너 환경변수로 넘긴다. 값은 코드·로그에 남기지 않는다.
  // 새 환경변수가 생기면 wrangler secret put 과 함께 여기에도 추가해야 컨테이너에 전달된다.
  // 마이그레이션은 컨테이너 밖에서 돌리므로 DIRECT_DATABASE_URL 은 넘기지 않는다.
  envVars: Record<string, string> = {
    DATABASE_URL: secrets.DATABASE_URL,
    CORS_ORIGIN: secrets.CORS_ORIGIN,
    // 비밀값을 등록하지 않았으면 넘기지 않는다(그때 관리 API 는 항상 401).
    ...(secrets.ADMIN_TOKEN ? { ADMIN_TOKEN: secrets.ADMIN_TOKEN } : {}),
    ...(secrets.APP_VERSION ? { APP_VERSION: secrets.APP_VERSION } : {}),
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
