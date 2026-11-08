import {
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  HealthResponseSchema,
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
};
