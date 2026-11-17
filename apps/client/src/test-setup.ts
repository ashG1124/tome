import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals 를 켜지 않으므로 RTL 자동 정리가 동작하지 않아 직접 등록한다.
afterEach(cleanup);
