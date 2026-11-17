// dist/esm 은 패키지 type=commonjs(기본)와 충돌하므로 각 폴더에 모듈 형식을 표시한다.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/esm/package.json', import.meta.url), '{"type":"module"}\n');
writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n');
