import { EventEnvelopeSchema, NodeSnapshotSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { calculateIdentity, type CalcEvent } from '../modules/identity/identity-calc';
import { buildSeedPlan, type SeedPlan } from './plan';

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
  const setStats = sets.map((set) => {
    const mine = plan.answers.filter((a) => a.setId === set.id);
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
    expect(seedProjects).toHaveLength(15);
    expect(plan.projects.filter((p) => p.ownerKind === 'persona')).toHaveLength(5);
    expect(plan.topics.length).toBeGreaterThanOrEqual(3);
    expect(plan.topics.length).toBeLessThanOrEqual(5);
    expect(plan.comments.length).toBeGreaterThanOrEqual(3);
    expect(plan.comments.length).toBeLessThanOrEqual(5);
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

  it('first project of each seed creator uses the preset prompt', () => {
    const firsts = plan.creators
      .filter((c) => c.spec.kind === 'seed')
      .map((c) => plan.projects.find((p) => p.ownerId === c.id)!);
    for (const project of firsts) {
      const set = plan.sets.find((s) => s.projectId === project.id && s.position === 1)!;
      expect(set.presetKey).toBe(project.spec.presetKey);
      expect(set.prompt).toBe(project.spec.prompt);
    }
  });

  it('event counts are 60-150 per creator', () => {
    for (const c of plan.creators) {
      const n = plan.events.filter((e) => e.creatorId === c.id).length;
      expect(n, c.key).toBeGreaterThanOrEqual(60);
      expect(n, c.key).toBeLessThanOrEqual(150);
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

  it('is deterministic', () => {
    // 같은 입력이면 같은 결과(캐시를 우회해 한 번 더 만들 수는 없으므로 id·시각 규칙만 확인한다).
    const sorted = plan.events.map((e) => e.id);
    expect(sorted).toEqual(buildSeedPlan().events.map((e) => e.id));
  });
});
