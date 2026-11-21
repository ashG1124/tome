import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import { hasSession } from '../shared/api';
import { AgoraHomePage, AgoraProjectPage, TopicPage } from '../pages/agora';
import { ConsentPage } from '../pages/consent';
import { EnterPage } from '../pages/enter';
import { ProfilePage } from '../pages/profile';
import { WorkspacePage } from '../pages/workspace';
import { Layout } from './layout';
import { RootPage, type RootLoaderData } from './root-page';

/** 세션(토큰)이 없으면 전시 코드 입력 화면으로 보낸다. */
function requireSession() {
  if (!hasSession()) throw redirect('/enter');
  return null;
}

/** `/` 는 세션이 없으면 랜딩을, 있으면 홈 서가를 그린다(RootPage). 레이아웃이 이 값을 보고 랜딩만 여백을 없앤다. */
function rootLoader(): RootLoaderData {
  return { landing: !hasSession() };
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/enter', element: <EnterPage /> },
      { path: '/consent', loader: requireSession, element: <ConsentPage /> },
      { path: '/', loader: rootLoader, element: <RootPage /> },
      { path: '/projects/:id', loader: requireSession, element: <WorkspacePage /> },
      { path: '/creators/:id', loader: requireSession, element: <ProfilePage /> },
      { path: '/agora', loader: requireSession, element: <AgoraHomePage /> },
      { path: '/agora/topics/:id', loader: requireSession, element: <TopicPage /> },
      { path: '/agora/projects/:id', loader: requireSession, element: <AgoraProjectPage /> },
      { path: '*', loader: () => redirect('/') },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
