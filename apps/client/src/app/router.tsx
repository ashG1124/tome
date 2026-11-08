import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import { hasSession } from '../shared/api';
import { ConsentPage } from '../pages/consent';
import { EnterPage } from '../pages/enter';
import { HomePage } from '../pages/home';
import { WorkspacePage } from '../pages/workspace';
import { Layout } from './layout';

/** 세션(토큰)이 없으면 전시 코드 입력 화면으로 보낸다. */
function requireSession() {
  if (!hasSession()) throw redirect('/enter');
  return null;
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/enter', element: <EnterPage /> },
      { path: '/consent', loader: requireSession, element: <ConsentPage /> },
      { path: '/', loader: requireSession, element: <HomePage /> },
      { path: '/projects/:id', loader: requireSession, element: <WorkspacePage /> },
      { path: '*', loader: () => redirect('/') },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
