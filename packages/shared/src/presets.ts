import { z } from 'zod';

export const PROMPT_PRESETS = [
  {
    key: 'music-video',
    label: 'Music video scene',
    prompt:
      'A neon-lit music video scene of a singer walking through rainy Seoul streets at night, cinematic wide shot',
    scenarioKey: 'music-video',
  },
  {
    key: 'desk-lamp',
    label: 'Studio desk lamp',
    prompt: 'A minimalist studio desk lamp glowing warmly on a wooden desk, soft product photo',
    scenarioKey: 'desk-lamp',
  },
  {
    key: 'sneaker',
    label: 'Sneaker redesign',
    prompt:
      'A pair of sneakers redesigned in a cyberpunk neon style, side view on a clean background',
    scenarioKey: 'sneaker',
  },
  {
    key: 'sofa',
    label: 'Cozy sofa',
    prompt: 'A cozy mid-century sofa in a sunlit living room, warm natural tones, interior photo',
    scenarioKey: 'sofa',
  },
  {
    key: 'eco-library',
    label: 'Eco-friendly library',
    prompt:
      'A sustainable eco-friendly library with wooden structures, green plants, and soft natural light',
    scenarioKey: 'eco-library',
  },
] as const;

export type PresetKey = (typeof PROMPT_PRESETS)[number]['key'];

export const PresetKeySchema = z.enum(
  PROMPT_PRESETS.map((p) => p.key) as [PresetKey, ...PresetKey[]],
);
