/** 스토리에 쓰는 앱 화면 이미지(onboarding 자산 폴더 안 파일 이름과 원본 픽셀 크기). */
export interface StoryShot {
  file: string;
  w: number;
  h: number;
}

const shot = (file: string, w: number, h: number): StoryShot => ({ file, w, h });

export const SHOTS = {
  home: shot('story-home.webp', 2661, 1741),
  entry: shot('story-entry.webp', 3548, 2314),
  zoomout: shot('story-zoomout.webp', 3533, 2306),
  frameE: shot('story-frame-e.webp', 3040, 1985),
  frameF: shot('story-frame-f.webp', 3040, 1985),
  frameG: shot('story-frame-g.webp', 3548, 2322),
  preview: shot('story-project-preview.webp', 1776, 1424),
  nodesA: shot('story-nodes-a.webp', 3840, 1760),
  nodesB: shot('story-nodes-b.webp', 3840, 1760),
  nodesC: shot('story-nodes-c.webp', 3840, 1760),
  nodesD: shot('story-nodes-d.webp', 3840, 1760),
  nodesH: shot('story-nodes-h.webp', 3840, 1860),
  remixA: shot('story-remix-nodes-a.webp', 3840, 1875),
  remixB: shot('story-remix-nodes-b.webp', 3840, 1875),
} as const;

export type ShotId = keyof typeof SHOTS;
