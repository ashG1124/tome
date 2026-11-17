import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS 의존성 주입은 데코레이터 메타데이터가 필요하고 esbuild 는 이를 내보내지 않아 SWC 를 쓴다.
export default defineConfig({
  test: {
    // worker/*.test.ts: Worker 의 순수 함수(Cloudflare 모듈을 안 쓰는 파일)만 시험한다(#45).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
