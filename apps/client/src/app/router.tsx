import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import { hasSession } from '../shared/api';
import { Layout } from './layout';
import { PageLoading } from './page-loading';
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

/**
 * 페이지는 길을 열 때 내려받는다(첫 화면에 필요한 모듈만 받게). loader 는 그대로 정적으로 둔다.
 * 이름 있는 내보내기를 라우트의 Component 로 돌려준다.
 */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    HydrateFallback: PageLoading,
    children: [
      {
        path: '/enter',
        lazy: async () => ({ Component: (await import('../pages/enter')).EnterPage }),
      },
      {
        path: '/consent',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/consent')).ConsentPage }),
      },
      { path: '/', loader: rootLoader, element: <RootPage /> },
      {
        path: '/projects/:id',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/workspace')).WorkspacePage }),
      },
      {
        path: '/creators/:id',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/profile')).ProfilePage }),
      },
      {
        path: '/agora',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/agora')).AgoraHomePage }),
      },
      {
        path: '/agora/topics',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/agora')).TopicListPage }),
      },
      {
        path: '/agora/topics/:id',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/agora')).TopicPage }),
      },
      {
        path: '/agora/projects/:id',
        loader: requireSession,
        lazy: async () => ({ Component: (await import('../pages/agora')).AgoraProjectPage }),
      },
      { path: '*', loader: () => redirect('/') },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
