import {
  UpdateVerificationRequestSchema,
  UpdateVerificationResponseSchema,
  type UpdateVerificationRequest,
  GetAnswerResponseSchema,
  PinAnswerRequestSchema,
  PinAnswerResponseSchema,
  NodeCommentListResponseSchema,
  CreateNodeCommentRequestSchema,
  CreateNodeCommentResponseSchema,
  type CreateNodeCommentRequest,
  AcceptAnswerResponseSchema,
  CreateRevisionRequestSchema,
  CreateRevisionResponseSchema,
  type CreateRevisionRequest,
  type IdempotencyKey,
  AdvanceJobRequestSchema,
  AdvanceJobResponseSchema,
  AgoraHomeResponseSchema,
  AgoraProjectResponseSchema,
  CancelJobResponseSchema,
  CommentListResponseSchema,
  CompareResponseSchema,
  ConnectionListResponseSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreatePageResponseSchema,
  CreateAgoraCommentRequestSchema,
  CreateAgoraCommentResponseSchema,
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  CreateSetRequestSchema,
  CreateSetResponseSchema,
  CreatorProfileResponseSchema,
  DismissConnectionResponseSchema,
  DeriveProjectResponseSchema,
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
  TopicResponseSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  WorkspaceResponseSchema,
  type CreateAgoraCommentRequest,
  type CreateProjectRequest,
  type CreateSetRequest,
  type FinishProjectRequest,
  type Id,
  type JobStage,
  type PostProjectRequest,
  type UpdateProjectRequest,
} from '@tome/shared';
import { request } from './client';
import { NoContentParser } from './responses';

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

  getAnswer: (answerId: Id) =>
    request({
      method: 'GET',
      path: `/answers/${segment(answerId)}`,
      schema: GetAnswerResponseSchema,
    }),

  pinAnswer: (answerId: Id, pinned: boolean) =>
    request({
      method: 'PUT',
      path: `/answers/${segment(answerId)}/pin`,
      body: PinAnswerRequestSchema.parse({ pinned }),
      schema: PinAnswerResponseSchema,
    }),

  updateVerification: (answerId: Id, body: UpdateVerificationRequest) =>
    request({
      method: 'PATCH',
      path: `/answers/${segment(answerId)}/verification`,
      body: UpdateVerificationRequestSchema.parse(body),
      schema: UpdateVerificationResponseSchema,
    }),

  listNodeComments: (answerId: Id) =>
    request({
      method: 'GET',
      path: `/answers/${segment(answerId)}/comments`,
      schema: NodeCommentListResponseSchema,
    }),

  createNodeComment: (
    answerId: Id,
    body: CreateNodeCommentRequest,
    idempotencyKey?: IdempotencyKey,
  ) =>
    request({
      method: 'POST',
      path: `/answers/${segment(answerId)}/comments`,
      body: CreateNodeCommentRequestSchema.parse(body),
      schema: CreateNodeCommentResponseSchema,
      idempotent: true,
      idempotencyKey,
    }),

  deleteNodeComment: (commentId: Id) =>
    request({
      method: 'DELETE',
      path: `/node-comments/${segment(commentId)}`,
      schema: NoContentParser,
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

  // ---- 리믹스(서버 PR #102)

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

  /**
   * 답변의 Connection(판단이 갈리는 노드). partnerId 를 빼면 지금 상대 기준으로 처음 볼 때 계산하고,
   * 예전 상대 id 를 주면 이미 만든 것만 준다. 상대가 없으면 NO_PARTNER.
   */
  listConnections: (answerId: Id, partnerId?: Id) =>
    request({
      method: 'GET',
      path: `/answers/${segment(answerId)}/connections${
        partnerId === undefined ? '' : `?partnerId=${segment(partnerId)}`
      }`,
      schema: ConnectionListResponseSchema,
    }),

  /** Connection 숨기기. 이미 applied·dismissed 면 그 상태를 그대로 돌려준다(여러 번 보내도 결과가 같아 멱등 키가 없다). */
  dismissConnection: (connectionId: Id) =>
    request({
      method: 'POST',
      path: `/connections/${segment(connectionId)}/dismiss`,
      schema: DismissConnectionResponseSchema,
    }),

  // ---- 아고라(서버 PR #100)

  /** 아고라 첫 화면: 추천·라이징 크리에이터·핫 토픽(공개 프로젝트가 있는 토픽만). */
  getAgoraHome: () => request({ method: 'GET', path: '/agora', schema: AgoraHomeResponseSchema }),

  /** 토픽 하나와 그 토픽의 공개 프로젝트. 없는 토픽이면 NOT_FOUND */
  getTopic: (topicId: Id) =>
    request({
      method: 'GET',
      path: `/agora/topics/${segment(topicId)}`,
      schema: TopicResponseSchema,
    }),

  /** 공개 프로젝트 상세. 게시를 내렸거나 지운 프로젝트면 NOT_FOUND */
  getAgoraProject: (projectId: Id) =>
    request({
      method: 'GET',
      path: `/agora/projects/${segment(projectId)}`,
      schema: AgoraProjectResponseSchema,
    }),

  /** 상세를 연 것을 센다(204). 서버가 같은 세션·같은 날에는 한 번만 세서 멱등 키가 없다. */
  recordAgoraView: (projectId: Id) =>
    request({
      method: 'POST',
      path: `/agora/projects/${segment(projectId)}/views`,
      schema: NoContentParser,
    }),

  /**
   * 파생(201): 대표 답변을 복사해 내 서가 맨 앞에 새 프로젝트를 만든다. 대표가 없거나 원작이 내려갔으면
   * DERIVE_SOURCE_UNAVAILABLE.
   */
  deriveProject: (projectId: Id) =>
    request({
      method: 'POST',
      path: `/agora/projects/${segment(projectId)}/derive`,
      schema: DeriveProjectResponseSchema,
      idempotent: true,
    }),

  /** 댓글(새것부터 limit 개, 기본 20·최대 50). before 에 받은 마지막 댓글 id 를 주면 그 다음 묶음. */
  listComments: (projectId: Id, page: { before?: Id; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (page.before !== undefined) query.set('before', page.before);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    const search = query.toString();
    return request({
      method: 'GET',
      path: `/projects/${segment(projectId)}/comments${search === '' ? '' : `?${search}`}`,
      schema: CommentListResponseSchema,
    });
  },

  /** 댓글 쓰기(201, 앞뒤 공백을 빼고 1~300자). */
  createComment: (projectId: Id, body: CreateAgoraCommentRequest) =>
    request({
      method: 'POST',
      path: `/projects/${segment(projectId)}/comments`,
      body: CreateAgoraCommentRequestSchema.parse(body),
      schema: CreateAgoraCommentResponseSchema,
      idempotent: true,
    }),

  /** 내 댓글 지우기(204). 남의 댓글이면 FORBIDDEN, 이미 지웠으면 NOT_FOUND. 서버가 멱등 키를 받지 않는다. */
  deleteComment: (commentId: Id) =>
    request({
      method: 'DELETE',
      path: `/comments/${segment(commentId)}`,
      schema: NoContentParser,
    }),
};
