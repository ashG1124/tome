import type { Node } from '@tome/shared';

/** 텍스트 단계의 입력: 프롬프트와 앞 단계까지 쌓인 노드. */
export interface StageInput {
  prompt: string;
  nodes: readonly Node[];
}

export interface AiImage {
  mimeType: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
}

export interface ImageInput {
  assembledPrompt: string;
  mode: 'generate' | 'edit';
  /** 편집 모드일 때 입력으로 쓸 기존 이미지(PNG) */
  baseImage?: Uint8Array;
  /** 편집 모드일 때 모델에 보낼 지시문 */
  editInstruction?: string;
}

/** 1단계 결과: 키워드 노드와, 켜진 키워드를 문장으로 잇는 subject 틀(`{k1}` 같은 자리표시). */
export interface AnalyzeResult {
  subjectTemplate: string;
  nodes: Node[];
}

export type AiProviderName = 'mock' | 'workers-ai';

/** 모든 공급자 호출 결과에 붙는 메타. model 은 실제로 성공한 모델 ID. */
export interface AiResult<T> {
  value: T;
  provider: AiProviderName;
  model: string;
  fallbackUsed: boolean;
  /** 호출들이 알려 준 neurons 의 합. 알 수 없으면 없음. */
  neurons?: number;
}

/** AI 공급자 경계. 공급자를 바꿀 때 이 인터페이스의 구현만 바꾼다. */
export interface AiProvider {
  readonly name: AiProviderName;
  analyze(input: StageInput): Promise<AiResult<AnalyzeResult>>;
  research(input: StageInput): Promise<AiResult<Node[]>>;
  evidence(input: StageInput): Promise<AiResult<Node[]>>;
  draft(input: StageInput): Promise<AiResult<Node[]>>;
  image(input: ImageInput): Promise<AiResult<AiImage>>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
