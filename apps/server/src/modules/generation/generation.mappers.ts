import {
  type Answer,
  type AnswerSummary,
  type Job,
  type JobStage,
  JobStageSchema,
  type JobStep,
  NodeSnapshotSchema,
  type Node,
  VerificationSchema,
  type Verification,
} from '@tome/shared';
import { stageIndex } from './stages';

/** 모든 답변 응답이 같은 규칙으로 쓰는 이미지 경로. */
export const answerImageUrl = (id: string) => `/assets/answers/${id}/full`;
export const answerThumbUrl = (id: string) => `/assets/answers/${id}/thumb`;

interface AnswerSummaryRow {
  id: string;
  number: number | null;
  pinned: boolean;
  isSample: boolean;
  createdAt: Date;
}

interface AnswerFullRow extends AnswerSummaryRow {
  setId: string;
  status: Answer['status'];
  origin: Answer['origin'];
  imageMode: Answer['imageMode'];
  baseAnswerId: string | null;
  nodes: unknown;
  verification: unknown;
}

export function toAnswerSummary(row: AnswerSummaryRow): AnswerSummary {
  return {
    id: row.id,
    number: row.number,
    pinned: row.pinned,
    isSample: row.isSample,
    thumbUrl: answerThumbUrl(row.id),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAnswer(row: AnswerFullRow): Answer {
  return {
    ...toAnswerSummary(row),
    setId: row.setId,
    status: row.status,
    origin: row.origin,
    imageMode: row.imageMode,
    baseAnswerId: row.baseAnswerId,
    imageUrl: answerImageUrl(row.id),
    nodes: NodeSnapshotSchema.parse(row.nodes),
    verification:
      row.verification === null || row.verification === undefined
        ? null
        : VerificationSchema.parse(row.verification),
  };
}

interface JobRowLike {
  id: string;
  status: Job['status'];
  startStage: string;
  nextStage: string | null;
  steps: { stage: string; status: JobStep['status'] }[];
}

export function toJob(row: JobRowLike): Job {
  const steps = [...row.steps]
    .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage))
    .map((s) => ({ stage: JobStageSchema.parse(s.stage), status: s.status }));
  return {
    id: row.id,
    status: row.status,
    startStage: JobStageSchema.parse(row.startStage),
    nextStage: row.nextStage === null ? null : JobStageSchema.parse(row.nextStage),
    steps,
  };
}

/** 텍스트 단계(analyze~draft)의 저장 출력. */
export interface TextStepOutput {
  nodes: Node[];
  subjectTemplate?: string;
}

export interface StepRowLike {
  stage: string;
  status: JobStep['status'];
  provider: string | null;
  fallbackUsed: boolean;
  output: unknown;
}

export const TEXT_STAGES: readonly JobStage[] = ['analyze', 'research', 'evidence', 'draft'];

/** 저장된 단계 → 응답 모양. image 는 호출하는 쪽이 읽어 온 answer 를 넘긴다. */
export function toStepResponse(row: StepRowLike, extras: { answer?: Answer } = {}): JobStep {
  const stage = JobStageSchema.parse(row.stage);
  const step: JobStep = {
    stage,
    status: row.status,
    provider: row.provider,
    fallbackUsed: row.fallbackUsed,
  };
  if (row.status !== 'succeeded' || row.output === null) return step;
  const output = row.output as Record<string, unknown>;
  if (TEXT_STAGES.includes(stage)) step.nodes = (output as unknown as TextStepOutput).nodes;
  if (stage === 'image' && extras.answer) step.answer = extras.answer;
  if (stage === 'verify') step.verification = output.verification as Verification;
  return step;
}
