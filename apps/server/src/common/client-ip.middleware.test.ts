import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_IP_HEADER, clientIpFromWorker } from './client-ip.middleware';

function run(headers: Record<string, string | string[] | undefined>) {
  const req = { headers: { ...headers } } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  clientIpFromWorker(req, {} as Response, next);
  return { headers: req.headers, next };
}

describe('clientIpFromWorker', () => {
  it('copies the Worker client IP into X-Forwarded-For', () => {
    const { headers, next } = run({ [CLIENT_IP_HEADER]: '203.0.113.10' });
    expect(headers['x-forwarded-for']).toBe('203.0.113.10');
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces a different X-Forwarded-For value', () => {
    const { headers } = run({
      [CLIENT_IP_HEADER]: '203.0.113.10',
      'x-forwarded-for': '10.0.0.1',
    });
    expect(headers['x-forwarded-for']).toBe('203.0.113.10');
  });

  it('drops X-Forwarded-For when the Worker header is missing', () => {
    const { headers, next } = run({ 'x-forwarded-for': '198.51.100.99' });
    expect(headers['x-forwarded-for']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('ignores an empty or repeated Worker header', () => {
    expect(run({ [CLIENT_IP_HEADER]: '' }).headers['x-forwarded-for']).toBeUndefined();
    expect(run({ [CLIENT_IP_HEADER]: ['a', 'b'] }).headers['x-forwarded-for']).toBeUndefined();
  });
});
