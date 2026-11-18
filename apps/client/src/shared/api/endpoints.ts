import {
  AcceptAnswerResponseSchema,
  CreateRevisionRequestSchema,
  CreateRevisionResponseSchema,
  type CreateRevisionRequest,
  type IdempotencyKey,
  AdvanceJobRequestSchema,
  AdvanceJobResponseSchema,
  CancelJobResponseSchema,
  CompareResponseSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreatePageResponseSchema,
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  CreateSetRequestSchema,
  CreateSetResponseSchema,
  CreatorProfileResponseSchema,
  FinishCandidatesResponseSchema,
  FinishProjectRequestSchema,
  FinishProjectResponseSchema,
  GetJobResponseSchema,
  HealthResponseSchema,
  IdentityResponseSchema,
  MeResponseSchema,
  PostProjectRequestSchema,
  PostProjectResponseSchema,
  ProjectListResponseSchema,
  RemixCandidatesResponseSchema,
  SetRemixPartnerRequestSchema,
  SetRemixPartnerResponseSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  WorkspaceResponseSchema,
  type CreateProjectRequest,
  type CreateSetRequest,
  type FinishProjectRequest,
  type Id,
  type JobStage,
  type PostProjectRequest,
  type UpdateProjectRequest,
} from '@tome/shared';
import { request } from './client';

const segment = (value: string) => encodeURIComponent(value);

/** 프로젝트·페이지·세트·job 을 바꾸는 요청에는 Idempotency-Key 를 붙인다(idempotent: true). 세션 요청은 빼고. */
export const api = {
  health: () =>
    request({
      method: 'GET',
      path: '/health',
      schema: HealthResponseSchema,
      auth: false,
      allowStatus: [503],
    }),

  createSession: (code: string) =>
    request({
      method: 'POST',
      path: '/session',
      body: CreateSessionRequestSchema.parse({ code }),
      schema: CreateSessionResponseSchema,
      auth: false,
    }),

  consent: (noticeVersion: string) =>
    request({
      method: 'POST',
      path: '/session/consent',
      body: ConsentRequestSchema.parse({ noticeVersion }),
      schema: ConsentResponseSchema,
    }),

  getMe: () => request({ method: 'GET', path: '/me', schema: MeResponseSchema }),

  // ---- 서가(프로젝트)

  listProjects: () =>
    request({ method: 'GET', path: '/projects', schema: ProjectListResponseSchema }),

  /** 새 프로젝트(서가 맨 앞). 프롬프트가 없으면 제목 Untitled + Page 0 만 만든다. */
  createProject: (body: CreateProjectRequest) =>
    request({
      method: 'POST',
      path: '/projects',
      body: CreateProjectRequestSchema.parse(body),
      schema: CreateProjectResponseSchema,
      idempotent: true,
    }),

  /** 제목 바꾸기·서가 순서 옮기기(shelfPosition 은 보이는 카드 기준 0부터). */
  updateProject: (projectId: Id, body: UpdateProjectRequest) =>
    request({
      method: 'PATCH',
      path: `/projects/${segment(projectId)}`,
      body: UpdateProjectRequestSchema.parse(body),
      schema: UpdateProjectResponseSchema,
      idempotent: true,
    }),

  /** 지우기(소프트 삭제, 204). 남은 프로젝트의 서가 순서는 서버가 0부터 다시 매긴다. */
  deleteProject: (projectId: Id) =>
    request({
      method: 'DELETE',
      path: `/projects/${segment(projectId)}`,
      // 204 라 본문이 없다
      schema: { parse: () => undefined },
      idempotent: true,
    }),

  // ---- 워크스페이스·페이지·세트

  /** pageId 를 주지 않으면 서버가 마지막 페이지를 연다. */
  getWorkspace: (projectId: Id, pageId?: Id) =>
    request({
      method: 'GET',
      path: `/projects/${segment(projectId)}/workspace${
        pageId === undefined ? '' : `?pageId=${segment(pageId)}`
      }`,
      schema: WorkspaceResponseSchema,
    }),

  /** 프로필: 창작자·작업물(남이면 게시작만)·아이덴티티 스냅샷(기록이 없으면 null). 없는 사람이면 NOT_FOUND */
  getCreator: (creatorId: Id) =>
    request({
      method: 'GET',
      path: `/creators/${encodeURIComponent(creatorId)}`,
      schema: CreatorProfileResponseSchema,
    }),

  /** 아이덴티티 스냅샷과 축 점수 표. 비공개인 사람이면 IDENTITY_PRIVATE(403) */
  getIdentity: (creatorId: Id) =>
    request({
      method: 'GET',
      path: `/creators/${encodeURIComponent(creatorId)}/identity`,
      schema: IdentityResponseSchema,
    }),

  /** Compare 탭: 나(로그인한 사람)와 다른 창작자들의 좌표. 계약대로 id 없이 부른다 */
  getCompare: () =>
    request({ method: 'GET', path: '/identity/compare', schema: CompareResponseSchema }),
  createPage: (projectId: Id) =>
    request({
      method: 'POST',
      path: `/projects/${segment(projectId)}/pages`,
      schema: CreatePageResponseSchema,
      idempotent: true,
    }),

  /** 프롬프트로 세트를 만든다. 응답의 job 을 advanceJob 으로 한 단계씩 진행한다. */
  createSet: (projectId: Id, body: CreateSetRequest) =>
    request({
      method: 'POST',
      path: `/projects/${segment(projectId)}/sets`,
      body: CreateSetRequestSchema.parse(body),
      schema: CreateSetResponseSchema,
      idempotent: true,
    }),

  // ---- 완료·게시

  /** 완료 모달의 대표 버전 후보: 핀 꽂은 답변, 핀이 없으면 전부. */
  getFinishCandidates: (projectId: Id) =>
    request({
      method: 'GET',
      path: `/projects/${segment(projectId)}/finish-candidates`,
      schema: FinishCandidatesResponseSchema,
    }),

  /** 완료(제목·대표 버전·이유). 응답은 { project } (FinishProjectResponseSchema, #68). */
  finishProject: (projectId: Id, body: FinishProjectRequest) =>
    request({
      method: 'POST',
      path: `/projects/${segment(projectId)}/finish`,
      body: FinishProjectRequestSchema.parse(body),
      schema: FinishProjectResponseSchema,
      idempotent: true,
    }),

  /** 게시 켜고 끄기. 완료한 프로젝트만 된다. */
  postProject: (projectId: Id, body: PostProjectRequest) =>
    request({
      method: 'PUT',
      path: `/projects/${segment(projectId)}/post`,
      body: PostProjectRequestSchema.parse(body),
      schema: PostProjectResponseSchema,
      idempotent: true,
    }),

  createRevision: (setId: Id, body: CreateRevisionRequest, idempotencyKey?: IdempotencyKey) =>
    request({
      method: 'POST',
      path: `/sets/${segment(setId)}/revisions`,
      body: CreateRevisionRequestSchema.parse(body),
      schema: CreateRevisionResponseSchema,
      idempotent: true,
      idempotencyKey,
    }),

  acceptAnswer: (answerId: Id, idempotencyKey?: IdempotencyKey) =>
    request({
      method: 'POST',
      path: `/answers/${segment(answerId)}/accept`,
      schema: AcceptAnswerResponseSchema,
      idempotent: true,
      idempotencyKey,
    }),

  // ---- 단계 진행(job)

  /** 한 단계를 진행한다. 같은 단계를 다시 보내면 저장된 결과가 온다(서버는 stage 로 중복을 막는다). */
  advanceJob: (jobId: Id, stage: JobStage) =>
    request({
      method: 'POST',
      path: `/jobs/${segment(jobId)}/advance`,
      body: AdvanceJobRequestSchema.parse({ stage }),
      schema: AdvanceJobResponseSchema,
      idempotent: true,
    }),

  /** 다시 열었을 때 이어서 하려고 job 과 지금까지의 단계 결과를 받는다. */
  getJob: (jobId: Id) =>
    request({ method: 'GET', path: `/jobs/${segment(jobId)}`, schema: GetJobResponseSchema }),

  cancelJob: (jobId: Id) =>
    request({
      method: 'POST',
      path: `/jobs/${segment(jobId)}/cancel`,
      schema: CancelJobResponseSchema,
      idempotent: true,
    }),

  // ---- 리믹스(서버 PR #102). Connection 은 캔버스 단계에서 더한다.

  /** 리믹스 후보. rising 은 라이징 순서(없으면 시드 순서), favorite 은 즐겨찾기한 순서. 나·비공개는 빠진다. */
  getRemixCandidates: (tab: 'rising' | 'favorite') =>
    request({
      method: 'GET',
      path: `/remix/candidates?tab=${tab}`,
      schema: RemixCandidatesResponseSchema,
    }),

  /** 즐겨찾기(204). 자기 자신은 VALIDATION_FAILED. 같은 사람을 다시 넣어도 그대로라 멱등 키가 없다. */
  addFavorite: (creatorId: Id) =>
    request({
      method: 'PUT',
      path: `/me/favorites/${segment(creatorId)}`,
      // 204 라 본문이 없다
      schema: { parse: () => undefined },
    }),

  /** 즐겨찾기 해제(204). 없던 사람이어도 성공한다. */
  removeFavorite: (creatorId: Id) =>
    request({
      method: 'DELETE',
      path: `/me/favorites/${segment(creatorId)}`,
      schema: { parse: () => undefined },
    }),

  /** 리믹스 상대 지정(partnerId) · 해제(null). 비공개 상대는 IDENTITY_PRIVATE, 나·visitor 는 VALIDATION_FAILED. */
  setRemixPartner: (projectId: Id, partnerId: Id | null) =>
    request({
      method: 'PUT',
      path: `/projects/${segment(projectId)}/remix-partner`,
      body: SetRemixPartnerRequestSchema.parse({ partnerId }),
      schema: SetRemixPartnerResponseSchema,
    }),
};
