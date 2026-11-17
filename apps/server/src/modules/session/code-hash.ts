import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

function derive(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** 전시 코드를 무작위 salt 와 함께 scrypt 로 해시한다. 형식: `scrypt$<salt>$<hash>`(base64url). */
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(code, salt);
  return `${PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** 저장된 해시와 코드가 같은지 timingSafeEqual 로 비교한다. 형식이 틀린 해시는 false. */
export async function verifyCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const salt = Buffer.from(parts[1]!, 'base64url');
  const expected = Buffer.from(parts[2]!, 'base64url');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(code, salt);
  return timingSafeEqual(actual, expected);
}
