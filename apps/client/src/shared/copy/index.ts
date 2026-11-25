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
  // ---- 홈 서가(#23): 확정 ID(#128). 문장은 Figma 원문(1185:57987, 1185:58199, 1226:78464)
  'H-01': 'Project',
  'H-02a': 'Posted',
  'H-02b': 'Finished',
  'H-03a': 'My Work',
  'H-03b': 'Remix',
  'H-03c': 'Derive',
  // Figma "Edited 2 hours ago" → 절대 날짜 규칙이라 "Edited {날짜}"로 붙여 쓴다
  'H-04': 'Edited',
  // 서가 순서 옮기기(#227): 임시 ID — 문구 표에 옮길 때 확정. Figma에 없는 낭독 문구(키 안내, 옮긴 뒤 role=status). {position}·{total} 자리
  'H-05': 'Press Alt and an arrow key to move this project on the shelf.',
  'H-06': 'Moved to position {position} of {total}.',
  // ---- 워크스페이스 틀(#25): 확정 ID(#128). W-05 는 Figma 원문(1187:62709), 나머지는 버튼 이름.
  'W-01': 'Page',
  'W-02': 'Pages',
  'W-03': 'Add page',
  'W-04': 'Finish project',
  'W-05': 'The project has been updated',
  'W-06': 'TÓME',
  // 플래시 stack(1187:62707) 원문. 노드 새 버전 확정 때 뜬다
  'W-07': 'This version will be updated as the accepted answer',
  // ---- 완료 모달(#34): 확정 ID(#128). 문장은 Figma 영어 원문 그대로(3182:176717, 3182:176864, 1187:62709).
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
  // ---- 프로필(#37): 확정 ID(#128). Figma 원문(1897:63700, 3252:21812, 3475:29083 등), P-07·P-17·P-19 는 Figma에 없는 문구
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
  // 말풍선 나머지 6개(리드 확정 문구)
  'P-18-ai-bottom-right': 'I take the lead and make big changes.',
  'P-18-ai-top-left': 'I let the AI lead and only nudge it a little.',
  'P-18-ai-bottom-left': 'I let the AI lead, but when I step in, I change a lot.',
  'P-18-decision-bottom-right': 'I chase new directions and follow my gut.',
  'P-18-decision-top-left': 'I refine one idea and let the numbers decide.',
  'P-18-decision-top-right': 'I refine one idea and trust my gut.',
  'P-19a': 'Identity scores',
  'P-19b': 'Axis',
  'P-19c': 'Score',
  // 프로필: 남의 비공개 아이덴티티(IDENTITY_PRIVATE). 리드 확정 2026-11-18
  'P-20': 'This creator keeps their identity private.',
  // 프로필 Proto v7(#220): 임시 ID — 문구 표에 옮길 때 확정. ⭐ 아이덴티티 (수정) 프로토타입(4181:34982) 원문.
  // P-23b·P-27b·P-30 은 Figma에 없는 문구(남의 프로필 제목·남의 프로필 비교 기준·낭독용 버튼 이름), 이름 자리는 {name}.
  // P-33 은 창작자 줄 설명(4181:35656)의 사분면별 조각. ai-bottom-left 는 시안에 없어 같은 꼴로 맞췄다.
  'P-21': 'Remixed by', // 4181:35741
  'P-22': 'Derived by', // 4181:35749
  'P-23a': 'About your identity', // 4181:35082
  'P-23b': "About this creator's identity",
  'P-24': 'Identity Type', // 4181:35088
  'P-25': 'Other Creators', // 4181:35169
  'P-26': 'clear', // 4181:35755
  'P-27a': 'Similarity to you', // 4181:35600
  'P-27b': 'Similarity to {name}',
  'P-28a': 'Creators', // 4181:35651
  'P-28b': 'matches', // 4181:35654
  'P-29a': 'How work with AI', // 4181:35174
  'P-29b': 'How decide?', // 4181:35384
  'P-30': 'Remix with {name}',
  'P-31a': 'Light touch', // 4181:35213
  'P-31b': 'Heavy edits', // 4181:35214
  'P-31c': 'AI leads', // 4181:35210
  'P-31d': 'Creator leads', // 4181:35211
  'P-31e': 'Narrows down', // 4181:35386
  'P-31f': 'Explores', // 4181:35386
  'P-31g': 'Trusts data', // 4181:35386
  'P-31h': 'Trusts gut', // 4181:35386
  'P-32a': 'Trust data', // 4181:35774 (필터 판)
  'P-32b': 'Trust gut', // 4181:35775 (필터 판)
  'P-33-ai-top-left': 'Lets the AI lead and nudges gently',
  'P-33-ai-top-right': 'Takes the lead and nudges gently',
  'P-33-ai-bottom-left': 'Lets the AI lead and edits boldly',
  'P-33-ai-bottom-right': 'Takes the lead and edits boldly',
  'P-33-decision-top-left': 'trusts data, narrows down',
  'P-33-decision-top-right': 'trusts gut, narrows down',
  'P-33-decision-bottom-left': 'trusts data, explores far',
  'P-33-decision-bottom-right': 'trusts gut, explores far',
  // ---- 공통 헤더(AppHeader 1226:80887): 확정 ID(#128). HD-01 은 Figma 글자 로고 원문, HD-02 는 Figma에 없는 낭독용 이름
  'HD-01': 'AGORA',
  'HD-02': 'My profile',
  // ---- 생성 캔버스(#26): 확정 ID(#128).
  'CV-01': 'Generation canvas',
  'CV-02': 'Prompt',
  // 단계 알약 이름: 시안 1679:10955 / 3924:67090 문구 그대로(#186)
  'CV-03': 'Question Analysis',
  'CV-04': 'Search for Materials',
  'CV-05': 'Evidence Extraction',
  'CV-06': 'Generate Draft',
  'CV-07': 'Verification',
  'CV-08': 'Answer {number}',
  'CV-09': 'Step {number}',
  'CV-10': 'Step {number} of 5 done',
  'CV-11': 'Model knowledge',
  'CV-12': 'Generating…',
  'CV-13': 'Waiting for this step.',
  'CV-14': 'Not measured',
  'CV-15': 'Fit view',
  'CV-16': 'Zoom in',
  'CV-17': 'Zoom out',
  'CV-18':
    'Use Left and Right to move between steps, Up and Down within a step, and Home or End to move to the first or last node.',
  'CV-19': 'Generation started.',
  // Figma 정합(#166): 확정 ID(ADR-044, 2026-11-24) — 단계 안 그룹 소제목(시안 Work Space-My work 3924:67090)
  'CV-20': 'Keywords',
  'CV-21': 'Data type',
  'CV-22': 'Search priority',
  'CV-23': 'Sentence supporting the answer',
  'CV-24': 'Verification criteria',
  'CV-25': 'Discrepancies',
  // Figma 정합(#176): 확정 ID(ADR-044, 2026-11-24) — 파생 워크스페이스 답변 카드 머리글(시안 Work Space-Derive 1679:15197)
  'DV-01': 'My answer',
  'DV-02': '{name}’s answer',
  // ---- 리믹스 패널(#41): 확정 ID(#128). RX-01~04 는 Figma 원문(Control bar 1720:80619, 제목 2513:226457),
  // RX-05~08 은 Figma에 없는 낭독용 이름
  'RX-01': 'Remix with',
  'RX-02': 'Rising',
  'RX-03': 'Favorite',
  'RX-04': 'remix with',
  // RX-05 는 H-03b 와 글자가 같지만 리믹스 버튼 낭독용 이름이라 따로 둔다(#128).
  'RX-05': 'Remix',
  'RX-06': 'Refresh the list',
  'RX-07': 'Add to favorites',
  'RX-08': 'Remove from favorites',
  // ---- 아고라(#39): 확정 ID(#128). 문장은 Figma 원문(3099:130540, 3099:130760, 1720:101534). A-08 은 Figma에 없는 버튼 이름
  'A-01': 'Hot Topic',
  'A-02': 'Comments',
  'A-03': 'See more',
  'A-04': 'Derivative',
  'A-05': 'Go to derive',
  'A-06': 'Derived from',
  'A-07': 'Likes',
  'A-08': 'Post',
  'A-09': 'Recommended Project',
  'A-10': 'Rising Creator',
  // Figma 정합(#168): 확정 ID(ADR-044, 2026-11-24). 홈 좌하단 Recent Work 알약 이름(1226:78124)과 열린 카드 머리글(1185:58872)
  'RW-01': 'Recent Work',
  'RW-02': 'Recent work',
  // ---- 노드 편집(#31): 확정 ID(#128).
  'NE-01': 'Edit node',
  'NE-02': 'Weighting',
  'NE-03': 'Meaning',
  'NE-04': 'Include',
  'NE-05': 'Regenerate',
  'NE-06': 'Priority',
  'NE-07': 'Move up',
  'NE-08': 'Move down',
  'NE-09': 'Preview',
  'NE-10': 'Apply the fix',
  'NE-11': 'Waiting for preview',
  'NE-12': 'Preview ready',
  'NE-13': 'Use Left or Down to decrease, Right or Up to increase, Home for 0, and End for 9.',
  'NE-14': 'Use arrow keys to move one step. Home returns to the center.',
  // 인트로 랜딩(#46) — 온보딩 시안 3445:27232·3330:206106·3330:206270·3445:27495
  'ON-01': 'Main menu',
  'ON-02a': 'My Work',
  'ON-02b': 'Remix',
  'ON-02c': 'Derive',
  'ON-02d': 'Identity',
  'ON-03': 'Get Started',
  'ON-04': 'Where thoughts become volumes',
  'ON-05': 'Our Vision',
  'ON-06a': 'Every thought,',
  'ON-06b': 'in one volume',
  'ON-07a':
    'Behind every AI-generated output lies your own thought process—the way you refined and selected the answers.',
  'ON-07b': 'TOME captures that process in a single volume to be placed on your bookshelf,',
  'ON-07c': 'and that single volume, in turn, becomes the starting point for someone else.',
  'ON-08a': 'Volumes',
  'ON-08b': 'of Thinking',
  'ON-09': 'Three ways to work',
  'ON-10a': 'Write it, Remix it,',
  'ON-10b': 'Pass it on',
  'ON-11':
    'I write a book from scratch using a prompt, incorporate the perspectives of other creators, and build on someone else’s work to write my own next instalment. Whichever method I use, the thought process is recorded exactly as it unfolds.',
  'ON-12a': '01',
  'ON-12b': '02',
  'ON-12c': '03',
  'ON-13a': 'MY WORK',
  'ON-13b': 'REMIX',
  'ON-13c': 'Derive',
  'ON-14a': 'My work, which I create by entering prompts',
  'ON-14b': "Projects blending my prompts with others' identities",
  'ON-14c': 'A derivative work based on the original creator’s work',
  'ON-15': 'CONTACT',
  'ON-16a': 'The Seoul Lightium,',
  'ON-16b': '32-14 Seoul Forest 2-gil',
  'ON-17': '2026.11.27(Fri) - 2026.11.30(Mon)',
  'ON-18': 'tomeofficial@gmail.com',
  'ON-19a': 'Fri 13:00 - 20:00',
  'ON-19b': 'Sat - Mon 10:00 - 18:00',
  'ON-20': '© 2026. All rights reserved.',
  'ON-21': 'Back to top',
  // 스크롤 스토리(#47) — 시안 3445:14652(My work / remix)·3337:207186(remix)
  'ON-22': 'How TÓME works',
  'ON-23a': 'MY WORK',
  'ON-23b': 'REMIX',
  'ON-23c': 'DERIVE',
  'ON-24': 'Enter a prompt and see how the AI reaches its answer.',
  'ON-25': '01 Question Analysis',
  'ON-26': 'Answer Stacking',
  'ON-27': 'Every edit stacks up a new answer.',
  'ON-28': 'Try Remix!',
  'ON-29': 'What would another creator have changed? Try collaborating with them virtually.',
  'ON-30a': 'Recommended Projects',
  'ON-30b': 'Creator List',
  'ON-30c': 'Topic List',
  // 온보딩 리뉴얼(#149): 확정 ID(ADR-044).
  'ON-31': 'Same draft. How would another creator judge it?',
  'ON-32a': "One person's process",
  'ON-32b': "becomes the next person's start",
  'ON-33a': "Explore the original creator's process, node by node.",
  'ON-33b': 'Stack your answer on the original to make a derivative of your own.',
  'ON-34': 'Prompt',
  'ON-35': 'Hello, Jiho. What shall we get started on?',
  'ON-36a': 'It reads the key terms in your prompt.',
  'ON-36b': 'Edit any node yourself and leave your reason.',
  'ON-36c': 'It decides what to look for, and in what order.',
  'ON-36d': 'It picks the sentences that back up the answer.',
  'ON-36e': "It sets the draft's direction from that evidence.",
  'ON-36f': 'It checks the draft against each criterion.',
  'ON-37a': 'Question Analysis',
  'ON-37b': 'Node Control',
  'ON-37c': 'Search for Materials',
  'ON-37d': 'Evidence Extraction',
  'ON-37e': 'Generate Draft',
  'ON-37f': 'Verification',
  'ON-38': 'My answer',
  'ON-39': 'Demonstration of the TÓME workspace',
  'ON-40': 'Scroll story: how TÓME works',
  'ON-41': 'Apply',
  // 노드 기록(#32): 확정 ID(ADR-044).
  'NH-01': 'Previous version',
  'NH-02': 'Next version',
  'NH-03': 'Pin answer',
  'NH-04': 'Unpin answer',
  'NH-05': 'No comments yet.',
  'NH-06': 'Loading comments…',
  'NH-07': 'Comment saved.',
  // 노드 코멘트 다시 디자인(#221): 새 ID. 시안에 원문이 없어 공통 문구 톤으로 정함.
  'NH-08': 'Delete this comment?',
  'NH-09': 'Comment deleted.',
  // Connection(#127): 확정 ID.
  'RC-01': 'Connection',
  'RC-02': 'Apply',
  'RC-03': 'Hide',
  'RC-04': 'Apply is not available yet.',
  'RC-05': 'Hiding connection…',
  'RC-06': 'Applied',
  // Connection Apply(#151): 임시 ID. Figma에 없는 공통 상태(비활성 이유 한 줄) 문구
  'RC-07': 'Only connections from your current partner can be applied.',
  'RC-08': 'Nothing to change on this node.',
  // Figma 재정합(#187): 임시 ID. AGS-03·04·05·06 은 헤더 검색창 원문(1226:81056, 1226:81058~81061). AGS-01·02·07·08 은 Figma에 없는 접근성·빈 결과 문구
  'AGS-01': 'No results.',
  'AGS-02': 'Results',
  'AGS-03': 'Start typing to search',
  'AGS-04': 'Project',
  'AGS-05': 'Creator',
  'AGS-06': 'Topic',
  'AGS-07': 'Search',
  'AGS-08': 'Search in',
  // 아고라 탭 화면(#214): 임시 ID — 문구 표에 옮길 때 확정. Creator 탭은 Figma 프레임이 없는 화면이라 AT-01 은 A-10 과 짝을 맞춘 구역 제목,
  // AT-02 는 핫토픽 묶음 "+N"(5170:135885)의 낭독 문장({count} 자리), AT-03 은 헤더 탭 묶음의 낭독 이름
  'AT-01': 'New Creator',
  'AT-02': '{count} more projects',
  'AT-03': 'Agora sections',
  G1: 'Finish a set first, then you can complete the project.',
  G2: "You're going a bit fast. Please wait a moment before trying again.",
  // Figma 재정합(#186): 임시 ID. 시안 문구 그대로, 이름 자리는 {name}.
  'FG-01': 'Hello, {name}. What shall we get started on?', // 프롬프트 바 자리 문구 1187:61881
  'FG-02': 'Find a creator', // 리믹스 검색칸 자리 문구 1720:80397
  'FG-03': 'Voice input', // 마이크 낭독 이름(시안에는 글자 없음)
  'FG-04': 'Start a new project with {name}', // 리믹스 상대가 있는 빈 페이지의 프롬프트 바 자리 문구 4898:93350 (#198)
  'FG-05': 'Send prompt', // 임시 ID(#228) — 여러 줄 프롬프트 바 보내기 버튼 낭독 이름(시안 3468:30243 에는 글자 없음)
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

/** Presentation adapter; all text is stored by copy ID in COPY. */
export const CANVAS_COPY = {
  title: COPY['CV-01'],
  prompt: COPY['CV-02'],
  stages: {
    analyze: COPY['CV-03'],
    research: COPY['CV-04'],
    evidence: COPY['CV-05'],
    draft: COPY['CV-06'],
    verify: COPY['CV-07'],
  },
  answer: (number: number) => COPY['CV-08'].replace('{number}', String(number).padStart(2, '0')),
  step: (number: number) => COPY['CV-09'].replace('{number}', String(number)),
  stepDone: (number: number) => COPY['CV-10'].replace('{number}', String(number)),
  modelKnowledge: COPY['CV-11'],
  generating: COPY['CV-12'],
  pending: COPY['CV-13'],
  skipped: COPY['CV-14'],
  retry: COPY['E-01b'],
  failed: COPY['E-01a'],
  fit: COPY['CV-15'],
  zoomIn: COPY['CV-16'],
  zoomOut: COPY['CV-17'],
  instructions: COPY['CV-18'],
  sample: COPY['C-06'],
  sampleDescription: COPY['C-07'],
  started: COPY['CV-19'],
  groups: {
    keywords: COPY['CV-20'],
    dataType: COPY['CV-21'],
    priority: COPY['CV-22'],
    evidence: COPY['CV-23'],
    criteria: COPY['CV-24'],
    mismatch: COPY['CV-25'],
  },
  derive: {
    mine: COPY['DV-01'],
    origin: (name: string) => COPY['DV-02'].replace('{name}', name),
    deletedOriginal: COPY['S-06'],
  },
} as const;

export const NODE_EDITOR_COPY = {
  title: COPY['NE-01'],
  weighting: COPY['NE-02'],
  meaning: COPY['NE-03'],
  enabled: COPY['NE-04'],
  regenerate: COPY['NE-05'],
  priority: COPY['NE-06'],
  moveUp: COPY['NE-07'],
  moveDown: COPY['NE-08'],
  close: COPY['D-11'],
  preview: COPY['NE-09'],
  apply: COPY['NE-10'],
  waiting: COPY['NE-11'],
  ready: COPY['NE-12'],
  weightInstructions: COPY['NE-13'],
  meaningInstructions: COPY['NE-14'],
  delete: COPY['S-07b'],
  comment: COPY['S-07a'],
} as const;

export const CANVAS_HISTORY_COPY = {
  versions: {
    previous: COPY['NH-01'],
    next: COPY['NH-02'],
    pin: COPY['NH-03'],
    unpin: COPY['NH-04'],
  },
  comments: {
    title: COPY['A-02'],
    input: COPY['S-07a'],
    submit: COPY['A-08'],
    close: COPY['D-11'],
    empty: COPY['NH-05'],
    loading: COPY['NH-06'],
    saved: COPY['NH-07'],
    remove: COPY['S-07b'],
    confirmRemove: COPY['NH-08'],
    cancel: COPY['D-09a'],
    removed: COPY['NH-09'],
  },
};
