import { EventEnvelopeSchema, NodeSnapshotSchema, PROMPT_PRESETS } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { calculateIdentity, type CalcEvent } from '../modules/identity/identity-calc';
import { SEED_CREATORS, SHOWCASE_CREATOR_ID } from './creators';
import { buildSeedPlan, type SeedPlan } from './plan';
import { figmaImageOf, TOPICS } from './specs';

/** 계획만으로 창작자의 4축을 계산한다(DB 없이). */
export function axesOf(plan: SeedPlan, creatorId: string) {
  const projects = plan.projects.filter((p) => p.ownerId === creatorId);
  const projectIds = new Set(projects.map((p) => p.id));
  const sets = plan.sets.filter((s) => projectIds.has(s.projectId));
  const events: CalcEvent[] = plan.events
    .filter((e) => e.creatorId === creatorId)
    .map((e) => ({
      type: e.type,
      sessionId: e.sessionId,
      serverTs: e.serverTs,
      setId: e.setId,
      origin: 'own' as const,
      payload: e.payload,
    }));
  // 서버(identity.repository countSets)처럼 파생 복사본은 시도로 세지 않는다.
  const setStats = sets.map((set) => {
    const mine = plan.answers.filter((a) => a.setId === set.id && a.origin !== 'derived_copy');
    return {
      attemptCount: mine.length,
      acceptedCount: mine.filter((a) => a.status === 'accepted').length,
    };
  });
  return calculateIdentity({ events, setStats, projectCount: projects.length });
}

describe('seed plan (no DB)', () => {
  const plan = buildSeedPlan();

  it('has the documented shape', () => {
    const seedProjects = plan.projects.filter((p) => p.ownerKind === 'seed');
    expect(seedProjects).toHaveLength(25);
    const personaProjects = plan.projects.filter((p) => p.ownerKind === 'persona');
    expect(personaProjects.filter((p) => p.ownerId !== SHOWCASE_CREATOR_ID)).toHaveLength(5);
    expect(personaProjects.filter((p) => p.ownerId === SHOWCASE_CREATOR_ID)).toHaveLength(20);
    expect(plan.topics.length).toBeGreaterThanOrEqual(3);
    expect(plan.topics.length).toBeLessThanOrEqual(5);
    const seedIds = new Set(plan.creators.filter((c) => c.spec.kind === 'seed').map((c) => c.id));
    const seedOnSeed = plan.comments.filter(
      (c) =>
        seedIds.has(c.authorId) &&
        seedIds.has(plan.projects.find((p) => p.id === c.projectId)!.ownerId),
    );
    expect(seedOnSeed.length).toBeGreaterThanOrEqual(3);
    expect(seedOnSeed.length).toBeLessThanOrEqual(5);
    expect(new Set(plan.comments.map((c) => c.id)).size).toBe(plan.comments.length);
    expect(new Set(plan.projects.map((p) => p.id)).size).toBe(plan.projects.length);
    expect(new Set(plan.answers.map((a) => a.id)).size).toBe(plan.answers.length);
    expect(new Set(plan.events.map((e) => e.id)).size).toBe(plan.events.length);
  });

  it('every topic has at least 4 posted projects (the hot-topic bundle fills its 4 tiles)', () => {
    // 계획의 프로젝트는 모두 finished + postedAt 이 있는 공개작이다
    const posted = plan.projects.filter((p) => p.postedAt instanceof Date);
    expect(plan.topics.length).toBeGreaterThan(0);
    for (const topic of plan.topics) {
      const count = posted.filter((p) => p.topicId === topic.id).length;
      expect(count, `topic ${topic.id}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('every answer snapshot passes the node schema; every event passes the event schema', () => {
    for (const a of plan.answers) NodeSnapshotSchema.parse(a.nodes);
    for (const e of plan.events) {
      const result = EventEnvelopeSchema.safeParse({
        id: e.id,
        schemaVersion: 1,
        type: e.type,
        projectId: e.projectId,
        ...(e.setId ? { setId: e.setId } : {}),
        ...(e.answerId ? { answerId: e.answerId } : {}),
        clientTs: (e.clientTs ?? e.serverTs).toISOString(),
        payload: e.payload,
      });
      expect(result.success, `${e.type} ${JSON.stringify(e.payload)}`).toBe(true);
    }
  });

  it('projects with a preset key use the exact preset prompt (sample results can be reused)', () => {
    const presetProjects = plan.projects.filter((p) => p.spec.presetKey !== undefined);
    expect(
      new Set(presetProjects.filter((p) => p.ownerKind === 'seed').map((p) => p.spec.presetKey))
        .size,
    ).toBeGreaterThanOrEqual(3);
    for (const project of presetProjects) {
      const preset = PROMPT_PRESETS.find((x) => x.key === project.spec.presetKey)!;
      const set = plan.sets.find((s) => s.projectId === project.id && s.position === 1)!;
      expect(set.presetKey, project.key).toBe(preset.key);
      expect(set.prompt, project.key).toBe(preset.prompt);
    }
  });

  it('every creator has at least 60 events', () => {
    for (const c of plan.creators) {
      const n = plan.events.filter((e) => e.creatorId === c.id).length;
      expect(n, c.key).toBeGreaterThanOrEqual(60);
    }
  });

  it('follows the design: topic titles, creator names with avatars, one design image per work', () => {
    expect(plan.topics.map((t) => t.title)).toEqual(TOPICS.map((t) => t.title));
    for (const creator of SEED_CREATORS) {
      if (creator.kind === 'visitor') expect(creator.avatar).toBeNull();
      else expect(creator.avatar, creator.displayName).toMatch(/^[a-z]+$/);
    }
    // 파생이 아닌 작업은 저마다 다른 시안 이미지를 쓰고, 파생은 원작 이미지를 쓴다.
    const own = plan.projects.filter((p) => p.kind === 'original');
    const images = own.map((p) => figmaImageOf(p.spec));
    expect(images.every((name) => name !== null)).toBe(true);
    expect(new Set(images).size).toBe(images.length);
    for (const p of plan.projects.filter((x) => x.kind === 'derive')) {
      const source = plan.projects.find((x) => x.id === p.derivedFromProjectId)!;
      expect(figmaImageOf(p.spec)).toBe(figmaImageOf(source.spec));
    }
  });

  it('computed axes are within ±10 of the targets', () => {
    for (const c of plan.creators) {
      const { axes } = axesOf(plan, c.id);
      const t = c.spec.target;
      expect(
        Math.abs(axes.scaleIntensity! - t.A),
        `${c.key} A ${axes.scaleIntensity}`,
      ).toBeLessThanOrEqual(10);
      expect(Math.abs(axes.aiRelation! - t.B), `${c.key} B ${axes.aiRelation}`).toBeLessThanOrEqual(
        10,
      );
      expect(
        Math.abs(axes.decisionBasis! - t.C),
        `${c.key} C ${axes.decisionBasis}`,
      ).toBeLessThanOrEqual(10);
      expect(Math.abs(axes.direction! - t.D), `${c.key} D ${axes.direction}`).toBeLessThanOrEqual(
        10,
      );
    }
  });

  it('seed creators have at least 3 signals on axes A, B and C', () => {
    for (const c of plan.creators.filter((x) => x.spec.kind === 'seed')) {
      const mine = plan.events.filter((e) => e.creatorId === c.id);
      const count = (types: string[]) => mine.filter((e) => types.includes(e.type)).length;
      expect(count(['weight_dial_click', 'meaning_point_set'])).toBeGreaterThanOrEqual(3);
      expect(count(['flag_decision'])).toBeGreaterThanOrEqual(3);
      expect(
        count(['node_open', 'weight_apply', 'source_apply', 'evidence_toggle']),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  describe('showcase account (persona 4)', () => {
    const showcase = SEED_CREATORS.find((c) => c.id === SHOWCASE_CREATOR_ID)!;
    const mine = plan.projects.filter((p) => p.ownerId === SHOWCASE_CREATOR_ID);
    const byKey = (key: string) => plan.projects.find((p) => p.key === key)!;

    it('is a public persona with a name and bio', () => {
      expect(showcase.kind).toBe('persona');
      expect(showcase.seedOrder).toBeNull();
      expect(showcase.displayName.length).toBeLessThanOrEqual(40);
      expect((showcase.bio ?? '').length).toBeLessThanOrEqual(120);
      expect(plan.creators.some((c) => c.id === SHOWCASE_CREATOR_ID)).toBe(true);
    });

    it('has own, remix and derive work in posted, finished and building states', () => {
      expect(mine.filter((p) => p.kind === 'derive').length).toBeGreaterThanOrEqual(2);
      expect(mine.filter((p) => p.remixPartnerId !== null).length).toBeGreaterThanOrEqual(2);
      expect(
        mine.filter((p) => p.kind === 'original' && p.remixPartnerId === null).length,
      ).toBeGreaterThanOrEqual(2);
      const posted = mine.filter((p) => p.postedAt !== null);
      const finishedOnly = mine.filter((p) => p.status === 'finished' && p.postedAt === null);
      const building = mine.filter((p) => p.status === 'building');
      expect(posted.length).toBeGreaterThanOrEqual(3);
      expect(finishedOnly.length).toBeGreaterThanOrEqual(1);
      expect(building.length).toBeGreaterThanOrEqual(1);
      for (const p of posted) expect(p.status).toBe('finished');
      for (const p of building) {
        expect(p.finishedAt).toBeNull();
        expect(p.postedAt).toBeNull();
        expect(p.selectionReason).toBeNull();
      }
      // 서가 순서는 0부터 빈틈 없이
      expect(mine.map((p) => p.shelfPosition).sort((a, b) => a - b)).toEqual(mine.map((_, i) => i));
      // 이벤트도 상태와 맞다(작업 중이면 완료·게시 이벤트가 없다)
      for (const p of mine) {
        const types = plan.events.filter((e) => e.projectId === p.id).map((e) => e.type);
        expect(types.includes('project_finish'), p.key).toBe(p.finishedAt !== null);
        expect(types.includes('project_post'), p.key).toBe(p.postedAt !== null);
      }
    });

    it('derived projects start from a copy of the source cover answer', () => {
      for (const p of mine.filter((x) => x.kind === 'derive')) {
        const source = plan.projects.find((x) => x.id === p.derivedFromProjectId)!;
        expect(source.ownerKind).toBe('seed');
        expect(p.derivedFromAnswerId).toBe(source.coverAnswerId);
        const firstSet = plan.sets.find((s) => s.projectId === p.id && s.position === 1)!;
        const first = plan.answers.find((a) => a.setId === firstSet.id && a.number === 1)!;
        const cover = plan.answers.find((a) => a.id === source.coverAnswerId)!;
        expect(first.origin).toBe('derived_copy');
        expect(first.copiedFromAnswerId).toBe(cover.id);
        expect(first.nodes).toEqual(cover.nodes);
        expect(first.assembledPrompt).toBe(cover.assembledPrompt);
        expect(firstSet.prompt).toBe(plan.sets.find((s) => s.projectId === source.id)!.prompt);
        const opener = plan.events.find((e) => e.setId === firstSet.id)!;
        expect(opener.type).toBe('derive_start');
        expect(opener.payload).toEqual({ sourceProjectId: source.id, sourceAnswerId: cover.id });
      }
    });

    it('remix projects point at seed partners and record the partner pick', () => {
      const seedIds = new Set(plan.creators.filter((c) => c.spec.kind === 'seed').map((c) => c.id));
      for (const p of mine.filter((x) => x.remixPartnerId !== null)) {
        expect(seedIds.has(p.remixPartnerId!)).toBe(true);
        const pick = plan.events.find(
          (e) => e.projectId === p.id && e.type === 'remix_partner_select',
        );
        expect(pick?.payload).toEqual({ partnerId: p.remixPartnerId });
      }
      expect(byKey('julian-2').remixPartnerId).toBe(
        plan.creators.find((c) => c.key === 'seed-2')!.id,
      );
    });

    it('has favorites, pinned answers and comments in both directions', () => {
      const favs = plan.favorites.filter((f) => f.creatorId === SHOWCASE_CREATOR_ID);
      expect(favs.length).toBeGreaterThanOrEqual(1);
      expect(new Set(favs.map((f) => f.targetCreatorId)).size).toBe(favs.length);
      expect(favs.every((f) => f.targetCreatorId !== SHOWCASE_CREATOR_ID)).toBe(true);
      const pinned = plan.answers.filter((a) => a.pinned);
      expect(pinned.length).toBeGreaterThanOrEqual(1);
      for (const a of pinned) {
        expect(a.status).toBe('accepted');
        expect(mine.some((p) => p.coverAnswerId === a.id)).toBe(true);
      }
      const ids = new Set(mine.map((p) => p.id));
      expect(plan.comments.some((c) => c.authorId === SHOWCASE_CREATOR_ID)).toBe(true);
      expect(plan.comments.some((c) => ids.has(c.projectId))).toBe(true);
      for (const c of plan.comments) {
        expect(plan.projects.find((p) => p.id === c.projectId)!.postedAt).not.toBeNull();
      }
    });

    it('has a final (non-provisional) identity with every axis filled', () => {
      const result = axesOf(plan, SHOWCASE_CREATOR_ID);
      expect(result.provisional).toBe(false);
      expect(Object.values(result.axes).every((v) => v !== null)).toBe(true);
      expect(result.metrics.reasonedRatio).not.toBeNull();
    });
  });

  it('is deterministic', () => {
    // 같은 입력이면 같은 결과(캐시를 우회해 한 번 더 만들 수는 없으므로 id·시각 규칙만 확인한다).
    const sorted = plan.events.map((e) => e.id);
    expect(sorted).toEqual(buildSeedPlan().events.map((e) => e.id));
  });
});
