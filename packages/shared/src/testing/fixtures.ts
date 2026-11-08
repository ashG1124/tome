import type { Answer } from '../answer.js';
import type { CreatorSummary } from '../session.js';
import type { Job } from '../generation.js';
import type { Node, NodeSnapshot } from '../node.js';
import type { ProjectSummary } from '../project.js';

export const ID_A = '3f2b8a1e-5c4d-4e6f-8a7b-9c0d1e2f3a4b';
export const ID_B = '7d9e1c2a-6b5f-4a3e-9d8c-1b2a3c4d5e6f';
export const ID_C = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const NOW = '2026-11-08T09:30:00.000Z';

export const creator: CreatorSummary = {
  id: ID_A,
  kind: 'seed',
  displayName: 'Mara Quill',
  bio: null,
  avatarUrl: null,
};

export const keywordNode: Node = {
  id: 'k1',
  stage: 'analyze',
  kind: 'keyword',
  text: 'singer',
  enabled: true,
  weight: 5,
  pad: { x: 0, y: 0, xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] },
  parentIds: [],
};

export const snapshot: NodeSnapshot = {
  schemaVersion: 1,
  subjectTemplate: '{k1} walking',
  nodes: [keywordNode],
};

export const answer: Answer = {
  id: ID_B,
  number: 1,
  pinned: false,
  isSample: false,
  thumbUrl: '/assets/answers/x/thumb',
  createdAt: NOW,
  setId: ID_C,
  status: 'accepted',
  origin: 'generated',
  imageMode: 'generate',
  baseAnswerId: null,
  imageUrl: '/assets/answers/x/full',
  nodes: snapshot,
  verification: null,
};

export const job: Job = {
  id: ID_C,
  status: 'running',
  startStage: 'analyze',
  nextStage: 'research',
  steps: [{ stage: 'analyze', status: 'succeeded' }],
};

export const project: ProjectSummary = {
  id: ID_A,
  title: 'Neon stage',
  status: 'building',
  posted: false,
  coverThumbUrl: null,
  lastEditedAt: NOW,
  shelfPosition: 0,
  kind: 'original',
};
