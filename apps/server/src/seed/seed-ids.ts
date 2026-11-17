import { createHash } from 'node:crypto';

/** 키 문자열에서 늘 같은 uuid 를 만든다(시드를 다시 돌려도 id 가 같다). */
export function seedUuid(key: string): string {
  const bytes = createHash('sha1').update(`tome-seed:${key}`).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** 키에서 만든 결정적 난수(mulberry32). 같은 키면 같은 수열. */
export function seededRandom(key: string): () => number {
  let state = createHash('sha1').update(`tome-seed-rng:${key}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
