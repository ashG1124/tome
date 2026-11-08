import { COPY } from '../copy';
import { TOKENS, tokenVar } from '../tokens';
import { Button } from './Button';
import { Icon } from './Icon';

interface ErrorNoticeProps {
  message: string;
  /** 있으면 Retry 버튼을 보여 준다. 실패한 단계만 다시 실행한다. */
  onRetry?: () => void;
}

/** 실패한 자리에 보이는 오류 문장. 새로 뜨면 보조기기가 바로 읽도록 role="alert" 를 쓴다. */
export function ErrorNotice({ message, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-[var(--space-gap-4)]"
      style={{ color: tokenVar(TOKENS.colorPeachText) }}
    >
      <Icon name="warning" size={20} />
      <span className="[font:var(--text-body-b1-m)]">{message}</span>
      {onRetry ? <Button onClick={onRetry}>{COPY['E-01b']}</Button> : null}
    </div>
  );
}
