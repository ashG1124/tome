import { useLoaderData } from 'react-router';
import { HomePage } from '../pages/home';
import { LandingPage } from '../pages/landing';

/** `/` 는 세션이 없으면 인트로 랜딩, 있으면 홈 서가다. 레이아웃은 loaderData 로 랜딩인지 안다. */
export interface RootLoaderData {
  landing: boolean;
}

export function RootPage() {
  const { landing } = useLoaderData() as RootLoaderData;
  return landing ? <LandingPage /> : <HomePage />;
}
