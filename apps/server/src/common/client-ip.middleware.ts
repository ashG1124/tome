import type { NextFunction, Request, Response } from 'express';

/**
 * Cloudflare Worker 가 실제 접속 IP를 담아 보내는 헤더 이름.
 * X-Forwarded-For 는 Cloudflare 가 직접 덧붙이고 관리하는 헤더라 그 값에 기대지 않고,
 * IP는 이 헤더로 따로 받는다.
 * Worker 가 이 헤더를 항상 덮어쓰거나 지우므로 사용자가 직접 보내도 속일 수 없다.
 */
export const CLIENT_IP_HEADER = 'x-tome-client-ip';

/**
 * CLIENT_IP_HEADER 값을 X-Forwarded-For 자리에 옮긴다. trust proxy 와 함께 쓰면 req.ip 가 그 값이 된다.
 * 헤더가 없으면(로컬 실행 등) X-Forwarded-For 를 지워서 req.ip 가 실제 연결 주소가 되게 한다.
 */
export function clientIpFromWorker(req: Request, _res: Response, next: NextFunction): void {
  const clientIp = req.headers[CLIENT_IP_HEADER];
  if (typeof clientIp === 'string' && clientIp.length > 0) {
    req.headers['x-forwarded-for'] = clientIp;
  } else {
    delete req.headers['x-forwarded-for'];
  }
  next();
}
