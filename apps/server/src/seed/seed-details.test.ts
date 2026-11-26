import { CreateNodeCommentRequestSchema, LIMITS } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { commentableNodeIds } from '../modules/comments/comments.rules';
import { isPublicAnswer } from '../modules/generation/answers.service';
import { SHOWCASE_CREATOR_ID } from './creators';
import { SEED_VERIFICATION } from './nodes';
import { buildSeedPlan } from './plan';
import { projectIndexOf, SEED_NODE_COMMENTS } from './specs';

// #247: 시안처럼 세세한 시드(노드 코멘트·버전 더미·리믹스/파생 도달·아고라 댓글).
describe('seed details like the design (#247)', () => {
  const plan = buildSeedPlan();
  const projectOf = (projectId: string) => plan.projects.find((p) => p.id === projectId)!;
  const answerById = new Map(plan.answers.map((a) => [a.id, a]));
  const setById = new Map(plan.sets.map((s) => [s.id, s]));
  const projectOfAnswer = (answerId: string) =>
    projectOf(setById.get(answerById.get(answerId)!.setId)!.projectId);
  const showcase = plan.projects.filter((p) => p.ownerId === SHOWCASE_CREATOR_ID);
  const byKey = (key: string) => plan.projects.find((p) => p.key === key)!;

  describe('node comments', () => {
    it('one plan row per spec, unique ids, and the same ids on every build', () => {
      expect(plan.nodeComments).toHaveLength(SEED_NODE_COMMENTS.length);
      expect(new Set(plan.nodeComments.map((c) => c.id)).size).toBe(plan.nodeComments.length);
      const again = buildSeedPlan();
      expect(again.nodeComments.map((c) => [c.id, c.answerId, c.nodeId])).toEqual(
        plan.nodeComments.map((c) => [c.id, c.answerId, c.nodeId]),
      );
    });

    it('every comment targets a real node (or verification criterion) of its answer snapshot', () => {
      for (const c of plan.nodeComments) {
        const answer = answerById.get(c.answerId);
        expect(answer, c.id).toBeDefined();
        expect(answer!.status).toBe('accepted');
        const ids = commentableNodeIds({ nodes: answer!.nodes, verification: SEED_VERIFICATION });
        expect(ids.has(c.nodeId), `${c.nodeId} on ${answer!.projectKey}`).toBe(true);
        // 불일치(m*)는 보기 전용이라 코멘트를 받지 않는다.
        expect(c.nodeId.startsWith('m')).toBe(false);
      }
    });

    it('bodies pass the server request schema (1~300, trimmed)', () => {
      for (const c of plan.nodeComments) {
        const parsed = CreateNodeCommentRequestSchema.parse({ nodeId: c.nodeId, body: c.body });
        expect(parsed.body).toBe(c.body);
        expect(c.body.length).toBeLessThanOrEqual(LIMITS.COMMENT_MAX);
      }
    });

    it('authors can read the answer (owner, or a public answer of a posted project) and comment after it exists', () => {
      for (const c of plan.nodeComments) {
        const answer = answerById.get(c.answerId)!;
        const project = projectOfAnswer(c.answerId);
        if (project.ownerId !== c.authorId) {
          expect(
            isPublicAnswer(project, { ...answer, acceptedAt: answer.createdAt }),
            `${c.id} on ${project.key}`,
          ).toBe(true);
        }
        expect(c.createdAt.getTime()).toBeGreaterThan(answer.createdAt.getTime());
      }
    });

    it('the showcase account sees its own reasons on its stacked works, plus a note from someone else', () => {
      const onShowcase = plan.nodeComments.filter(
        (c) => projectOfAnswer(c.answerId).ownerId === SHOWCASE_CREATOR_ID,
      );
      expect(
        onShowcase.filter((c) => c.authorId === SHOWCASE_CREATOR_ID).length,
      ).toBeGreaterThanOrEqual(10);
      expect(onShowcase.some((c) => c.authorId !== SHOWCASE_CREATOR_ID)).toBe(true);
      // 리믹스·파생 작업에도 코멘트가 있다.
      expect(onShowcase.some((c) => projectOfAnswer(c.answerId).remixPartnerId !== null)).toBe(
        true,
      );
      expect(onShowcase.some((c) => projectOfAnswer(c.answerId).kind === 'derive')).toBe(true);
    });

    it('the showcase reasons sit on nodes that really changed from the previous version', () => {
      for (const c of plan.nodeComments) {
        const answer = answerById.get(c.answerId)!;
        if (answer.baseAnswerId === null || !/^[kdsea]\d+$/.test(c.nodeId)) continue;
        if (projectOfAnswer(c.answerId).ownerId !== c.authorId) continue;
        const before = answerById.get(answer.baseAnswerId)!;
        const node = (a: typeof answer) => a.nodes.nodes.find((n) => n.id === c.nodeId);
        expect(node(answer), `${c.id} ${c.nodeId}`).not.toEqual(node(before));
      }
    });
  });

  describe('answer stacks', () => {
    it('showcase hero works stack up to Answer 06 and the pinned one is the cover', () => {
      const versions = (key: string) =>
        plan.answers.filter(
          (a) => a.projectKey === key && a.status === 'accepted' && a.origin !== 'derived_copy',
        ).length;
      expect(versions('julian-1')).toBe(6);
      expect(versions('julian-5')).toBe(6);
      expect(versions('julian-4')).toBe(5);
      const pinned = plan.answers.find((a) => a.projectKey === 'julian-1' && a.pinned)!;
      expect(pinned.number).toBe(6);
      expect(byKey('julian-1').coverAnswerId).toBe(pinned.id);
    });
  });

  describe('profile reach of the showcase account', () => {
    it('is remixed by six creators and derived by three', () => {
      const remixers = new Set(
        plan.projects
          .filter(
            (p) => p.remixPartnerId === SHOWCASE_CREATOR_ID && p.ownerId !== SHOWCASE_CREATOR_ID,
          )
          .map((p) => p.ownerId),
      );
      expect(remixers.size).toBe(6);
      const showcaseIds = new Set(showcase.map((p) => p.id));
      const derives = plan.projects.filter(
        (p) =>
          p.kind === 'derive' && p.derivedFromProjectId && showcaseIds.has(p.derivedFromProjectId),
      );
      expect(new Set(derives.map((p) => p.ownerId)).size).toBe(3);
      for (const p of derives) {
        const source = projectOf(p.derivedFromProjectId!);
        expect(source.postedAt).not.toBeNull();
        expect(p.derivedFromAnswerId).toBe(source.coverAnswerId);
        const first = plan.answers.find(
          (a) => a.setId === plan.sets.find((s) => s.projectId === p.id)!.id && a.number === 1,
        )!;
        expect(first.origin).toBe('derived_copy');
        expect(first.copiedFromAnswerId).toBe(source.coverAnswerId);
        // 적재 순서: 원작이 파생보다 먼저 들어간다(외래 키).
        expect(plan.projects.indexOf(source)).toBeLessThan(plan.projects.indexOf(p));
      }
    });

    it('records the partner pick for every remix of the showcase account', () => {
      for (const p of plan.projects.filter((x) => x.remixPartnerId === SHOWCASE_CREATOR_ID)) {
        const pick = plan.events.find(
          (e) => e.projectId === p.id && e.type === 'remix_partner_select',
        );
        expect(pick?.payload, p.key).toEqual({ partnerId: SHOWCASE_CREATOR_ID });
      }
    });
  });

  describe('project numbers stay stable when the plan order changes', () => {
    it('keeps the old numbering and gives the new derives the last numbers', () => {
      expect(projectIndexOf('mara-1')).toBe(0);
      expect(projectIndexOf('lena-2')).toBe(29);
      expect(projectIndexOf('julian-1')).toBe(30);
      expect(projectIndexOf('julian-20')).toBe(49);
      expect(projectIndexOf('erick-d1')).toBe(50);
      expect(projectIndexOf('nick-d1')).toBe(52);
      // 원작 노드 라이브러리 번호는 프로젝트 번호다(파생은 원작 번호를 이어 쓴다).
      expect(byKey('julian-1').libraryIndex).toBe(30);
      expect(byKey('nick-d1').libraryIndex).toBe(30);
    });
  });

  describe('agora comments', () => {
    it('the Urban Trail chunky sneaker carries twelve comments like the design detail', () => {
      const id = byKey('isla-2').id;
      expect(plan.comments.filter((c) => c.projectId === id)).toHaveLength(12);
    });

    it('posted showcase works get comments from others; seed-to-seed comments stay at five', () => {
      const showcaseIds = new Set(showcase.map((p) => p.id));
      const onShowcase = plan.comments.filter((c) => showcaseIds.has(c.projectId));
      expect(new Set(onShowcase.map((c) => c.projectId)).size).toBeGreaterThanOrEqual(5);
      expect(onShowcase.every((c) => c.authorId !== SHOWCASE_CREATOR_ID)).toBe(true);
      const seedIds = new Set(plan.creators.filter((c) => c.spec.kind === 'seed').map((c) => c.id));
      expect(
        plan.comments.filter(
          (c) => seedIds.has(c.authorId) && seedIds.has(projectOf(c.projectId).ownerId),
        ),
      ).toHaveLength(5);
    });
  });
});
