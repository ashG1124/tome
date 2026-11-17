import type { CreatorKind } from '../generated/prisma/client';

export interface SeedCreator {
  id: string;
  kind: CreatorKind;
  displayName: string;
  bio: string | null;
  seedOrder: number | null;
}

// 고정 uuid 로 upsert 하므로 시드를 다시 돌려도 결과가 같다. id·kind·seedOrder 는 운영 DB 에 이미 있으니 바꾸지 않는다.
const idFor = (group: number, n: number): string =>
  `00000000-0000-7000-8000-${String(group).padStart(4, '0')}${String(n).padStart(8, '0')}`;

const SEED_NAMES = [
  ['Mara Quill', 'A bold director who pushes every knob to the edge'],
  ['Dove Ellison', 'A gentle curator who lets the AI lead'],
  ['Rhys Calder', 'An evidence-first builder who trusts the numbers'],
  ['Isla Moreno', 'A restless explorer chasing new directions'],
  ['Teo Nakamura', 'A precise tuner who nudges small details'],
] as const;

const PERSONA_NAMES = [
  ['Priya Vance', 'Demo driver — balanced, mid-everything'],
  ['Owen Brandt', 'Demo driver — bold + divergent'],
  ['Lena Fox', 'Demo driver — evidence + convergent'],
] as const;

export const SEED_CREATORS: SeedCreator[] = [
  ...SEED_NAMES.map(([displayName, bio], i) => ({
    id: idFor(1, i + 1),
    kind: 'seed' as const,
    displayName,
    bio,
    seedOrder: i + 1,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: idFor(2, i + 1),
    kind: 'visitor' as const,
    displayName: `Visitor ${i + 1}`,
    bio: null,
    seedOrder: null,
  })),
  ...PERSONA_NAMES.map(([displayName, bio], i) => ({
    id: idFor(3, i + 1),
    kind: 'persona' as const,
    displayName,
    bio,
    seedOrder: null,
  })),
];

export const seedCreatorIds = (kind: CreatorKind): string[] =>
  SEED_CREATORS.filter((c) => c.kind === kind).map((c) => c.id);
