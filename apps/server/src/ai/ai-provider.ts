import type { Node } from '@tome/shared';

/** 텍스트 단계의 입력: 프롬프트와 앞 단계까지 쌓인 노드. */
export interface StageInput {
  prompt: string;
  nodes: readonly Node[];
}

export interface AiImage {
  mimeType: 'image/png';
  bytes: Uint8Array;
}

export interface ImageInput {
  assembledPrompt: string;
  /** 편집 모드일 때 입력으로 쓸 기존 이미지 */
  baseImage?: Uint8Array;
}

/** AI 공급자 경계. 공급자를 바꿀 때 이 인터페이스의 구현만 바꾼다. */
export interface AiProvider {
  readonly name: string;
  analyze(input: StageInput): Promise<Node[]>;
  research(input: StageInput): Promise<Node[]>;
  evidence(input: StageInput): Promise<Node[]>;
  draft(input: StageInput): Promise<Node[]>;
  image(input: ImageInput): Promise<AiImage>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
