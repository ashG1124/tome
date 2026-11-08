import type { ReactNode } from 'react';
import { TitleInput } from '../../src/shared/ui';

// 시범 비교용 안내 글자. 앱 copy 에는 넣지 않는다.
const SAMPLE = 'Please ~~~';

/** cases.ts 의 id → 그릴 화면 */
export const renders: Record<string, () => ReactNode> = {
  'title-input/default': () => (
    <TitleInput aria-label="Title" value="" placeholder={SAMPLE} onChange={() => {}} />
  ),
  'title-input/writing': () => <TitleInput aria-label="Title" value={SAMPLE} onChange={() => {}} />,
  'title-input/done': () => <TitleInput aria-label="Title" value={SAMPLE} onChange={() => {}} />,
};
