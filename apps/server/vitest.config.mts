import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS 의존성 주입은 데코레이터 메타데이터가 필요하고 esbuild 는 이를 내보내지 않아 SWC 를 쓴다.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
