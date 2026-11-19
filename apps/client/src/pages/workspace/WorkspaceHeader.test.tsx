import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { WorkspaceHeader } from './WorkspaceHeader';

function HomeProbe() {
  const location = useLocation();
  const state = location.state as { flash?: string } | null;
  return <p>{`home:${state?.flash ?? 'none'}`}</p>;
}

function renderAt(title: string | undefined) {
  const router = createMemoryRouter(
    [
      { path: '/projects/:id', element: <WorkspaceHeader title={title} /> },
      { path: '/', element: <HomeProbe /> },
    ],
    { initialEntries: ['/projects/p1'] },
  );
  render(<RouterProvider router={router} />);
}

describe('WorkspaceHeader', () => {
  it('가운데에 프로젝트 제목을 제목(heading)으로 보인다', () => {
    renderAt('Neon street at night');
    expect(screen.getByRole('heading', { name: 'Neon street at night' })).toBeTruthy();
  });

  it('제목을 불러오는 중이면 임시 문구를 보인다', () => {
    renderAt(undefined);
    expect(screen.getByRole('heading', { name: SKELETON_COPY.workspace })).toBeTruthy();
  });

  it('로고를 누르면 홈으로 가면서 Update 플래시를 알린다', async () => {
    renderAt('Neon street at night');

    fireEvent.click(screen.getByRole('link', { name: COPY['W-06'] }));

    expect(await screen.findByText('home:update')).toBeTruthy();
  });
});
