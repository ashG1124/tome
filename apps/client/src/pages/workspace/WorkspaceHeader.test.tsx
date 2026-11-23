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

  it('새 프로젝트의 기본 제목(Untitled)은 눈에 안 보이게 숨기고 낭독기용으로만 남긴다', () => {
    renderAt('Untitled');
    expect(screen.getByRole('heading', { name: 'Untitled' }).className).toContain('sr-only');
  });

  it('제목이 생기면 보인다', () => {
    renderAt('Neon street at night');
    expect(screen.getByRole('heading').className).not.toContain('sr-only');
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

describe('WorkspaceHeader 리믹스 상대(#41)', () => {
  it('상대가 있으면 제목 뒤에 "remix with 이름"을 붙인다(구분 막대는 낭독하지 않는다)', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/projects/:id',
          element: <WorkspaceHeader title="Studio desk lamp" partnerName="Lind" />,
        },
      ],
      { initialEntries: ['/projects/p1'] },
    );
    render(<RouterProvider router={router} />);
    // 화면 낭독기가 읽는 이름에는 구분 막대가 없다
    const heading = screen.getByRole('heading', {
      level: 1,
      name: `Studio desk lamp ${COPY['RX-04']} Lind`,
    });
    expect(heading.querySelector('[aria-hidden="true"]')?.textContent).toBe('|');
  });
});
