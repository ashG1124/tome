import { Outlet } from 'react-router';

export function Layout() {
  return (
    <main className="p-[var(--space-padding-8)]">
      <Outlet />
    </main>
  );
}
