import { apiConfig } from './config';
import { NetworkError } from './errors';
import type { Transport } from './transport';

export const liveTransport: Transport = async ({ method, path, headers, body }) => {
  let response: Response;
  try {
    response = await fetch(`${apiConfig.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
  const text = await response.text();
  let parsed: unknown;
  if (text !== '') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }
  return { status: response.status, body: parsed };
};
