import type { ProjectSummary } from '@tome/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { COPY } from '../../shared/copy';
import { RecentWork } from './RecentWork';
import { formatEditedDate, latestEdited } from './shelf';

function project(id: string, title: string, lastEditedAt: string): ProjectSummary {
  return {
    id,
    title,
    status: 'building',
    posted: false,
    coverThumbUrl: null,
    lastEditedAt,
    shelfPosition: 0,
    kind: 'original',
  };
}

const OLD = project('a', 'Old', '2026-11-01T10:00:00.000Z');
const NEW = project('b', 'Branding for a new cosmetics brand', '2026-11-05T10:00:00.000Z');

describe('latestEdited', () => {
  it('가장 최근에 편집한 프로젝트를 고른다', () => {
    expect(latestEdited([OLD, NEW])?.id).toBe('b');
  });
  it('프로젝트가 없으면 null', () => {
    expect(latestEdited([])).toBeNull();
  });
});

describe('RecentWork', () => {
  function renderIt() {
    const router = createMemoryRouter(
      [
        { path: '/', element: <RecentWork project={NEW} /> },
        { path: '/projects/:id', element: <p>workspace</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
  }

  it('닫혀 있을 땐 알약만, 누르면 제목·절대 편집일·열기 링크가 보인다', () => {
    renderIt();
    const button = screen.getByRole('button', { name: COPY['RW-01'] });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(NEW.title)).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(NEW.title)).toBeTruthy();
    expect(screen.getByText(`${COPY['H-04']} ${formatEditedDate(NEW.lastEditedAt)}`)).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/projects/b');
  });

  it('Escape 로 닫고 포커스를 버튼으로 돌린다', () => {
    renderIt();
    const button = screen.getByRole('button', { name: COPY['RW-01'] });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(NEW.title)).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
