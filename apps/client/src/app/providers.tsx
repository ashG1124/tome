import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// 실패한 요청은 자동으로 다시 보내지 않는다. 화면의 Retry 버튼이 다시 요청한다.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
