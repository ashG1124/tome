import { z } from 'zod';

/**
 * 프리셋(예시 프롬프트).
 * `previousPrompts` 는 예전에 쓰던 문장이다. 화면에는 나오지 않고, 예전 문장으로 만든 세트를
 * 계속 그 프리셋으로 알아보는 데만 쓴다(`presetPrompts`).
 */
export const PROMPT_PRESETS = [
  {
    key: 'music-video',
    label: 'Music video scene',
    prompt:
      'A neon-lit music video scene of a singer walking through rainy Seoul streets at night, cinematic wide shot',
    previousPrompts: [],
    scenarioKey: 'music-video',
  },
  {
    key: 'desk-lamp',
    label: 'Studio desk lamp',
    prompt:
      "Please visualise the concept for a 'studio desk lamp' to sit on my workbench. It's stainless steel with a half-dome shade. Since it goes on a desk, set the height to around 40cm, and two joints feels about right. I'd like the structural design of the joints to read clearly, with a round base that isn't too thick. Keep it clean, with no added decoration.",
    previousPrompts: [
      'A minimalist studio desk lamp glowing warmly on a wooden desk, soft product photo',
    ],
    scenarioKey: 'desk-lamp',
  },
  {
    key: 'sneaker',
    label: 'Sneaker redesign',
    prompt:
      "Please visualise the concept for a 'city-to-trail everyday sneaker' for commuters in their 20s and 30s who walk a lot. I'd like it to be centred around a recycled knit upper and a chunky but lightweight sole, with a calm, muted colour palette.",
    previousPrompts: [
      'A pair of sneakers redesigned in a cyberpunk neon style, side view on a clean background',
    ],
    scenarioKey: 'sneaker',
  },
  {
    key: 'sofa',
    label: 'Cozy sofa',
    prompt: 'A cozy mid-century sofa in a sunlit living room, warm natural tones, interior photo',
    previousPrompts: [],
    scenarioKey: 'sofa',
  },
  {
    key: 'eco-library',
    label: 'Eco-friendly library',
    prompt:
      "Please visualise the concept for a 'sustainable eco-friendly library' themed around an urban forest, along with the initial massing design. I'd like it to be centred around a timber structure and have a high degree of liveability.",
    previousPrompts: [
      'A sustainable eco-friendly library with wooden structures, green plants, and soft natural light',
    ],
    scenarioKey: 'eco-library',
  },
] as const;

export type PresetKey = (typeof PROMPT_PRESETS)[number]['key'];

export const PresetKeySchema = z.enum(
  PROMPT_PRESETS.map((p) => p.key) as [PresetKey, ...PresetKey[]],
);

/** 그 프리셋으로 알아보는 문장들: 지금 문장이 맨 앞, 그 뒤가 예전 문장. 모르는 키면 빈 배열. */
export function presetPrompts(key: string): readonly string[] {
  const preset = PROMPT_PRESETS.find((p) => p.key === key);
  return preset === undefined ? [] : [preset.prompt, ...preset.previousPrompts];
}
