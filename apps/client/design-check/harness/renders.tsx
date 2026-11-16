import type { ReactNode } from 'react';
import { COPY } from '../../src/shared/copy';
import { Flash, Tabs, TitleInput } from '../../src/shared/ui';

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

// ---- 공통 부품: 플래시·탭
const TAB_ITEMS = [
  { value: 'work', label: COPY['P-01a'] },
  { value: 'identity', label: COPY['P-01b'] },
  { value: 'compare', label: COPY['P-01c'] },
] as const;
const tabs = (value: 'work' | 'identity' | 'compare') => () => (
  <Tabs value={value} onValueChange={() => {}} label="Profile" items={TAB_ITEMS}>
    {null}
  </Tabs>
);
Object.assign(renders, {
  'flash/done': () => <Flash kind="done" />,
  'flash/update': () => <Flash kind="update" />,
  'flash/stack': () => <Flash kind="stack" />,
  'tabs/work': tabs('work'),
  'tabs/identity': tabs('identity'),
  'tabs/compare': tabs('compare'),
});
