import { lazy, Suspense } from 'react';
import { useLoaderData } from 'react-router';
import { HomePage } from '../pages/home';
import { PageLoading } from './page-loading';

/** 랜딩은 이미지 자산이 수백 개라, 랜딩 경로(세션 없음)에서만 내려받도록 따로 나눈다. */
const LandingPage = lazy(() =>
  import('../pages/landing').then((module) => ({ default: module.LandingPage })),
);

/** `/` 는 세션이 없으면 인트로 랜딩, 있으면 홈 서가다. 레이아웃은 loaderData 로 랜딩인지 안다. */
export interface RootLoaderData {
  landing: boolean;
}

export function RootPage() {
  const { landing } = useLoaderData() as RootLoaderData;
  return landing ? (
    <Suspense fallback={<PageLoading />}>
      <LandingPage />
    </Suspense>
  ) : (
    <HomePage />
  );
}
