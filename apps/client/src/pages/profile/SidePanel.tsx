import { useId, useState, type ReactNode } from 'react';
import { Icon } from '../../shared/ui';

interface SidePanelProps {
  title: string;
  children: ReactNode;
}

/**
 * 프로필 오른쪽 패널(4181:35168): 384 폭, #F9FAFC 바탕, 위에 제목(H1).
 * 닫기(X)는 두지 않는다. 닫으면 다시 열 방법이 없어서다(#262). 구역은 제목 줄을 눌러 접고 편다.
 * 패널 높이는 왼쪽 내용(또는 화면 높이)을 따른다. 내용이 길면 패널 안에서 스크롤한다.
 * (안쪽을 absolute 로 띄워 패널 내용 길이가 화면 높이를 늘리지 않게 한다.)
 */
export function SidePanel({ title, children }: SidePanelProps) {
  const titleId = useId();
  return (
    <aside
      aria-labelledby={titleId}
      className="relative w-[var(--size-profile-panel-width)] shrink-0 rounded-[var(--radius-profile-card)] bg-[color:var(--color-profile-panel)]"
    >
      <div className="absolute inset-0 flex flex-col overflow-y-auto rounded-[var(--radius-profile-card)]">
        <div className="relative h-[var(--size-profile-panel-head)] shrink-0">
          <h2
            id={titleId}
            className="absolute top-[var(--space-profile-panel-title-top)] right-[var(--space-profile-panel-title-x)] left-[var(--space-profile-panel-title-x)] m-0 truncate [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]"
          >
            {title}
          </h2>
        </div>
        {children}
      </div>
    </aside>
  );
}

interface PanelSectionProps {
  title: string;
  /** 제목 오른쪽(접기 단추 앞)에 붙는 것. 예: "15 matches" */
  aside?: ReactNode;
  /** 구역 안쪽 여백. insight = About 구역(위아래 28·좌우 32), filter = 필터 구역(24) */
  spacing: 'insight' | 'filter';
  /** true 면 남은 높이를 다 쓴다(창작자 목록) */
  grow?: boolean;
  children: ReactNode;
}

const PADDING: Record<PanelSectionProps['spacing'], string> = {
  insight:
    'gap-[var(--space-gap-5)] px-[var(--space-profile-insight-x)] py-[var(--space-profile-insight-y)]',
  filter: 'gap-[var(--space-gap-3)] p-[var(--space-padding-8)]',
};

/**
 * 접을 수 있는 패널 구역(Section Header + Collapse Control 4181:35087). 위에 연한 선을 긋는다.
 * 제목 줄 전체가 단추라 키보드(Enter·Space)로 접고 편다.
 */
export function CollapsibleSection({
  title,
  aside,
  spacing,
  grow = false,
  children,
}: PanelSectionProps) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section
      aria-label={title}
      className={[
        'flex flex-col border-0 border-t border-solid border-[color:var(--color-border-default)]',
        PADDING[spacing],
        grow && open ? 'min-h-0 flex-1' : 'shrink-0',
      ].join(' ')}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full cursor-pointer items-end justify-between gap-[var(--space-gap-4)] rounded-[var(--radius-1)] border-0 bg-transparent p-0 text-left"
        >
          <span className="flex items-end gap-[var(--space-gap-4)]">
            <span className="[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
              {title}
            </span>
            {aside}
          </span>
          <span
            className={`flex text-[color:var(--color-font-sub-text)] transition-transform motion-reduce:transition-none ${open ? '' : 'rotate-180'}`}
          >
            <Icon name="arrow-up" size={24} />
          </span>
        </button>
      </h3>
      <div
        id={bodyId}
        hidden={!open}
        className={grow ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col'}
      >
        {children}
      </div>
    </section>
  );
}
