import type { CreatorKind } from '../../src/generated/prisma/client';

export interface SeedCreator {
  id: string;
  kind: CreatorKind;
  displayName: string;
  seedOrder: number | null;
}

// 고정 uuid 로 upsert 하므로 시드를 다시 돌려도 결과가 같다.
// 표시 이름은 자리 값이다. 실제 내용은 후속 작업에서 채운다.
const idFor = (group: number, n: number): string =>
  `00000000-0000-7000-8000-${String(group).padStart(4, '0')}${String(n).padStart(8, '0')}`;

const make = (
  kind: CreatorKind,
  group: number,
  count: number,
  label: string,
  ordered: boolean,
): SeedCreator[] =>
  Array.from({ length: count }, (_, i) => ({
    id: idFor(group, i + 1),
    kind,
    displayName: `${label} ${i + 1}`,
    seedOrder: ordered ? i + 1 : null,
  }));

export const SEED_CREATORS: SeedCreator[] = [
  ...make('seed', 1, 5, 'Seed', true),
  ...make('visitor', 2, 5, 'Visitor', false),
  ...make('persona', 3, 3, 'Persona', false),
];
