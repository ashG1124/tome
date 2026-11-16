import {
  CompareResponseSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  CreatorProfileResponseSchema,
  HealthResponseSchema,
  IdentityResponseSchema,
  MeResponseSchema,
  ProjectListResponseSchema,
  WorkspaceResponseSchema,
  type Id,
} from '@tome/shared';
import { request } from './client';

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

  listProjects: () =>
    request({ method: 'GET', path: '/projects', schema: ProjectListResponseSchema }),

  getWorkspace: (projectId: Id) =>
    request({
      method: 'GET',
      path: `/projects/${encodeURIComponent(projectId)}/workspace`,
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
};
