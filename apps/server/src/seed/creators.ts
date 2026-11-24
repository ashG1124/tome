import type { CreatorKind } from '../generated/prisma/client';

export interface SeedCreator {
  id: string;
  kind: CreatorKind;
  displayName: string;
  bio: string | null;
  seedOrder: number | null;
  /** 자산 폴더의 프로필 이미지 이름(seed/avatars/<avatar>.jpg). 없으면 이미지 없음 */
  avatar: string | null;
}

// 고정 uuid 로 upsert 하므로 시드를 다시 돌려도 결과가 같다. id·kind·seedOrder 는 운영 DB 에 이미 있으니 바꾸지 않는다.
const idFor = (group: number, n: number): string =>
  `00000000-0000-7000-8000-${String(group).padStart(4, '0')}${String(n).padStart(8, '0')}`;

// 이름·소개·프로필 이미지는 시안(Figma) 창작자 목록을 따른다. [이름, 소개(역할), 이미지 이름]
const SEED_NAMES = [
  ['Lind', 'Global Implementation Manager', 'lind'],
  ['Ceredic', 'Dynamic Interactions Engineer', 'ceredic'],
  ['Nichole', 'Direct Optimization Engineer', 'nichole'],
  ['Judy', 'International Response Designer', 'judy'],
  ['Jay', 'Human Assurance Supervisor', 'jay'],
] as const;

const PERSONA_NAMES = [
  ['Erick', 'Product Implementation Director', 'erick'],
  ['Hayden', 'Lead Security Executive', 'hayden'],
  ['Nick', 'International Intranet Coordinator', 'nick'],
  // 4번 = 쇼케이스 계정(전시 코드 하나가 연결된다). 프로젝트·리믹스·파생·아이덴티티가 미리 차 있다.
  ['Julian', 'Future Functionality Developer', 'julian'],
] as const;

export const SEED_CREATORS: SeedCreator[] = [
  ...SEED_NAMES.map(([displayName, bio, avatar], i) => ({
    id: idFor(1, i + 1),
    kind: 'seed' as const,
    displayName,
    bio,
    seedOrder: i + 1,
    avatar,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: idFor(2, i + 1),
    kind: 'visitor' as const,
    displayName: `Visitor ${i + 1}`,
    bio: null,
    seedOrder: null,
    avatar: null,
  })),
  ...PERSONA_NAMES.map(([displayName, bio, avatar], i) => ({
    id: idFor(3, i + 1),
    kind: 'persona' as const,
    displayName,
    bio,
    seedOrder: null,
    avatar,
  })),
];

/** 쇼케이스 계정 id(persona 4번). 전시 코드를 이 계정에 연결한다. */
export const SHOWCASE_CREATOR_ID = idFor(3, 4);

export const seedCreatorIds = (kind: CreatorKind): string[] =>
  SEED_CREATORS.filter((c) => c.kind === kind).map((c) => c.id);
