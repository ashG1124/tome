/**
 * 프롬프트 바 아이콘. 자산 저장소에 클립(attachment)·sparkle(connection) 파일이 아직 없어
 * (배포본 포함) 코드로 그린다. 색은 글자색을 따르고 장식용이라 낭독기에서 숨긴다.
 */
function PromptIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      data-icon-inline="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** 첨부(클립) */
export function ClipIcon() {
  return (
    <PromptIcon>
      <path d="M16.5 7.5v8.25a4.5 4.5 0 0 1-9 0V6.75a3 3 0 0 1 6 0v8.25a1.5 1.5 0 0 1-3 0V8.25" />
    </PromptIcon>
  );
}

/** sparkle(연결) */
export function SparkleIcon() {
  return (
    <PromptIcon>
      <path d="M12 3v18M3 12h18" />
    </PromptIcon>
  );
}
