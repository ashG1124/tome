import { COPY } from '../../../shared/copy';
import { LandingImage } from '../LandingImage';
import {
  ROLL_CREATORS,
  ROLL_PROJECTS,
  ROLL_TOPICS,
  type RollCreator,
  type RollProject,
  type RollTopic,
} from './rolling-data';

/** 카드 그림은 장식이라 alt 가 비어 있다. 처음 화면이 아니므로 모두 lazy. */
function Pic({ file, className }: { file: string; className?: string }) {
  return <LandingImage file={file} loading="lazy" className={className ?? 'story-card-pic'} />;
}

function ProjectCard({ item }: { item: RollProject }) {
  return (
    <li
      className="story-card story-card-project"
      data-roll-card={item.title === 'Sound armor' ? 'sound-armor' : undefined}
    >
      <Pic file={item.image} className="story-card-cover" />
      <span aria-hidden="true" className="story-card-shade" />
      <div className="story-card-info">
        <p className="story-card-title">{item.title}</p>
        <span aria-hidden="true" className="story-card-avatar">
          <Pic file={item.avatar} />
        </span>
      </div>
    </li>
  );
}

function CreatorCard({ item }: { item: RollCreator }) {
  return (
    <li className="story-card story-card-creator">
      <span aria-hidden="true" className="story-creator-avatar">
        <Pic file={item.avatar} />
      </span>
      <div className="story-creator-text">
        <p className="story-creator-name">{item.name}</p>
        <p className="story-creator-role">{item.role}</p>
      </div>
    </li>
  );
}

function TopicCard({ item }: { item: RollTopic }) {
  return (
    <li className="story-card story-card-topic">
      <div aria-hidden="true" className="story-topic-collage">
        {item.cells.map((file) => (
          <span key={file} className="story-topic-cell">
            <Pic file={file} className="story-card-cover" />
          </span>
        ))}
        <span className="story-topic-more">{item.more}</span>
      </div>
      <p className={item.strong ? 'story-topic-title story-topic-strong' : 'story-topic-title'}>
        {item.title}
      </p>
    </li>
  );
}

type RowKind = 'projects' | 'creators' | 'topics';

const ROWS: readonly { kind: RowKind; label: 'ON-30a' | 'ON-30b' | 'ON-30c' }[] = [
  { kind: 'projects', label: 'ON-30a' },
  { kind: 'creators', label: 'ON-30b' },
  { kind: 'topics', label: 'ON-30c' },
];

function RowItems({ kind }: { kind: RowKind }) {
  if (kind === 'projects') {
    return ROLL_PROJECTS.map((item) => <ProjectCard key={item.title} item={item} />);
  }
  if (kind === 'creators') {
    return ROLL_CREATORS.map((item) => <CreatorCard key={item.name} item={item} />);
  }
  return ROLL_TOPICS.map((item) => <TopicCard key={item.title} item={item} />);
}

/**
 * Derive 롤링 띠 3줄(시안 3337:211082). 줄마다 카드 목록(ul/li)이고, 움직이는 모드에서는 같은 목록을 한 번 더
 * 이어 붙여(복제본은 읽기 대상이 아님) -50% 만큼 흘려 끝없이 보이게 한다. 정지 화면 모드에는 복제본이 없다.
 */
export function RollingBands({ loop }: { loop: boolean }) {
  return (
    <div className="story-bands">
      {ROWS.map(({ kind, label }) => (
        <div key={kind} data-roll-row={kind} className={`story-roll story-roll-${kind}`}>
          <div data-roll-track className="story-roll-track">
            <ul aria-label={COPY[label]} className="story-roll-list">
              <RowItems kind={kind} />
            </ul>
            {loop ? (
              <ul aria-hidden="true" data-roll-clone className="story-roll-list">
                <RowItems kind={kind} />
              </ul>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
