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
  // ---- 홈 서가(#23): 임시 ID. 문장은 Figma 원문(1185:57987, 1185:58199, 1226:78464)
  'H-01': 'Project',
  'H-02a': 'Posted',
  'H-02b': 'Finished',
  'H-03a': 'My Work',
  'H-03b': 'Remix',
  'H-03c': 'Derive',
  // Figma "Edited 2 hours ago" → 절대 날짜 규칙이라 "Edited {날짜}"로 붙여 쓴다
  'H-04': 'Edited',
  // ---- 워크스페이스 틀(#25): 임시 ID. W-05 는 Figma 원문(1187:62709), 나머지는 버튼 이름.
  'W-01': 'Page',
  'W-02': 'Pages',
  'W-03': 'Add page',
  'W-04': 'Finish project',
  'W-05': 'The project has been updated',
  'W-06': 'TÓME',
  // 플래시 stack(1187:62707) 원문. 노드 새 버전 확정 때 뜬다
  'W-07': 'This version will be updated as the accepted answer',
  // ---- 완료 모달(#34): 임시 ID. 문장은 Figma 영어 원문 그대로(3182:176717, 3182:176864, 1187:62709).
  'D-01': "If you're done, select the final version",
  'D-02': 'Complete the project by selecting a final version and explaining why you chose it.',
  'D-03a': 'Title',
  'D-03b': 'Please enter a title',
  'D-04': 'Select Final Version',
  'D-05a': 'Reasons for Choosing',
  'D-05b': 'Please explain why you chose this version',
  'D-06': 'Are you going to post this project?',
  'D-07a': 'Skip',
  'D-07b': 'Next',
  'D-08a': 'Complete this Project',
  'D-08b': 'This project is marked as complete.',
  'D-09a': 'Cancel',
  'D-09b': 'Done',
  'D-10': 'The project has been completed',
  // 아래 둘은 Figma에 없는 화면 낭독용 이름(닫기 X 버튼, 썸네일 "Version 3")
  'D-11': 'Close',
  'D-12': 'Version',
  // 결과 크게 보기(Done-03 3313:32167)의 버튼 이름. Figma에는 아이콘만 있음
  'D-13': 'Download',
  // ---- 프로필(#37): 임시 ID. Figma 원문(1897:63700, 3252:21812, 3475:29083 등), P-07·P-17·P-19 는 Figma에 없는 문구
  'P-01a': 'Work',
  'P-01b': 'Identity',
  'P-01c': 'Compare',
  'P-02': 'Scale',
  'P-03a': 'session',
  'P-03b': 'node edit',
  'P-04': 'Depth',
  'P-05': 'reasoned edits',
  'P-06': 'Duration',
  'P-07a': 'first recorded',
  'P-07b': 'last active',
  'P-08': "As there isn't much data yet, the identity may change",
  'P-09': 'How do I work with AI?',
  'P-10':
    'Left to right is who leads — creator or the AI. Top to bottom is how hard you push when you change something.',
  'P-11': 'How do I make a decision?',
  'P-12':
    'Left to right is what you trust — numbers or your gut. Top to bottom is how far you wander from the first idea.',
  'P-13a': 'Passive manipulation',
  'P-13b': 'Bold manipulation',
  'P-13c': 'Respect for autonomy',
  'P-13d': 'Dominance-oriented',
  'P-13e': 'Convergent / Efficiency-Oriented',
  'P-13f': 'Divergent / Experimental',
  'P-13g': 'Evidence-based / Data Driven',
  'P-13h': 'Intuition / Emotion-centered',
  'P-14': 'Remix how you work with AI',
  'P-15': 'Remix how you decide',
  'P-16': 'Me',
  'P-17': 'Still recording. Your identity appears after a few more edits.',
  'P-18-ai-top-right': 'I take the lead but I only nudge it a little.',
  'P-18-decision-bottom-left': 'I chase new directions and I want the numbers to back them up',
  'P-19a': 'Identity scores',
  'P-19b': 'Axis',
  'P-19c': 'Score',
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
