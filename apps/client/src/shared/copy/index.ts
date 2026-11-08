/**
 * 앱에 나가는 영어 문구. 키는 문구 ID(예: 'C-04')이고 한 곳에서만 고친다.
 * 한 ID에 문구가 둘이면(버튼 / 오류 등) 뒤에 a, b 를 붙인다. 프리셋 프롬프트는 'S-11a-prompt' 형태다.
 */
export const COPY = {
  'C-01': 'Before you start',
  'C-02':
    'TÓME records how you edit nodes to show your creative tendencies. Records are kept only for this exhibition and deleted within 7 days.',
  'C-03': 'Agree and start',
  'C-04': 'Enter the exhibition code',
  'C-05a': 'Enter',
  'C-05b': "That code doesn't match.",
  'C-06': 'Sample result',
  'C-07': "Live generation isn't available right now. This is a prepared example.",
  'C-08': "Today's free generation limit is reached. Try again tomorrow.",
  'E-01a': 'Something went wrong.',
  'E-01b': 'Retry',
  'E-02': 'This request was blocked by the safety filter. Try different words.',
  'E-03': 'Connection lost. Check the network and try again.',
  'E-04': 'Give your project a title.',
  'E-05': 'Saved, but posting failed. Try posting again.',
  'E-06': 'Use a JPG, PNG, or WebP image up to 10 MB.',
  'S-01': 'No projects yet. Start with + Project.',
  'S-02': 'Nothing has been posted yet.',
  'S-03': "Generating… You can type again when it's done.",
  'S-04': 'No creators to remix with yet.',
  'S-05': 'Waking up the server. This can take a few seconds.',
  'S-06': 'Deleted original',
  'S-07a': 'Add a comment',
  'S-07b': 'Delete',
  'S-08': 'Hello. What shall we get started on?',
  'S-09': 'This page is full. Add a new page to keep going.',
  'S-10': 'Visitor 1 ~ Visitor 5',
  'S-11a': 'Music video scene',
  'S-11a-prompt':
    'A neon-lit music video scene of a singer walking through rainy Seoul streets at night, cinematic wide shot',
  'S-11b': 'Studio desk lamp',
  'S-11b-prompt':
    'A minimalist studio desk lamp glowing warmly on a wooden desk, soft product photo',
  'S-11c': 'Sneaker redesign',
  'S-11c-prompt':
    'A pair of sneakers redesigned in a cyberpunk neon style, side view on a clean background',
  'S-11d': 'Cozy sofa',
  'S-11d-prompt':
    'A cozy mid-century sofa in a sunlit living room, warm natural tones, interior photo',
  'S-11e': 'Eco-friendly library',
  'S-11e-prompt':
    'A sustainable eco-friendly library with wooden structures, green plants, and soft natural light',
  'S-12': 'Reference image',
  G1: 'Finish a set first, then you can complete the project.',
  G2: "You're going a bit fast. Please wait a moment before trying again.",
} as const;

export type CopyKey = keyof typeof COPY;

/** 화면 골격 단계에서 쓰는 임시 문구. 화면이 자리를 잡으면 문구 표 ID로 옮긴다. */
export const SKELETON_COPY = {
  home: 'Home',
  workspace: 'Workspace',
  loading: 'Loading…',
  backToHome: 'Back to home',
  pages: (count: number) => `Pages: ${count}`,
} as const;
