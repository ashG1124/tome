import { Outlet } from 'react-router';
import { useWakingStore } from '../shared/api';
import { COPY } from '../shared/copy';
import { StatusBanner } from '../shared/ui';

export function Layout() {
  // 앱을 열거나 새로고침한 뒤 첫 요청이 1초를 넘기면 어느 화면이든 맨 위에 S-05 띠(아이콘 없음).
  const waking = useWakingStore((state) => state.waking);

  return (
    <main className="p-[var(--space-padding-8)]">
      {waking ? <StatusBanner message={COPY['S-05']} withIcon={false} /> : null}
      <Outlet />
    </main>
  );
}
