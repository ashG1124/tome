import type { CSSProperties } from 'react';
import { landingAsset } from '../assets';
import { obAg } from './shared';
import { CREATORS, HERO_INDEX, PROJECTS, TOPICS } from './dv-data';

/** 해시에 해당하는 아고라 이미지를 배경으로 쓴다. 자산이 없으면 배경 그림은 건너뛴다. */
function imageStyle(hash: string): CSSProperties {
  const src = landingAsset(obAg(hash));
  return src === undefined ? {} : { backgroundImage: `url(${src})` };
}

const EMPTY_PROJECT = ['', '', ''] as const;
const EMPTY_TOPIC = ['', '', []] as const;

/** 프로젝트 카드 한 장(표지 + 어두운 그라데이션 + 제목 + 제작자 아바타) */
export function ProjectCard({ index, hero }: { index: number; hero?: boolean }) {
  const [title, cover, avatar] = PROJECTS[index % PROJECTS.length] ?? EMPTY_PROJECT;
  return (
    <div className="dv-pcard" style={imageStyle(cover)} data-dv-hero={hero ? '' : undefined}>
      <span className="dv-pcard-title">{title}</span>
      <span className="dv-pcard-avatar" style={imageStyle(avatar)} />
    </div>
  );
}

/** 크리에이터 카드(알약 모양) */
function CreatorCard({ index }: { index: number }) {
  const [name, role, avatar] = CREATORS[index] ?? EMPTY_PROJECT;
  return (
    <div className="dv-ccard">
      <span className="dv-ccard-avatar" style={imageStyle(avatar)} />
      <span className="dv-ccard-text">
        <span className="dv-ccard-name">{name}</span>
        <span className="dv-ccard-role">{role}</span>
      </span>
    </div>
  );
}

/** 주제 카드(2×2 썸네일 + 더 있는 개수 + 제목) */
function TopicCard({ index }: { index: number }) {
  const [title, more, thumbs] = TOPICS[index] ?? EMPTY_TOPIC;
  return (
    <div className="dv-tcard">
      <div className="dv-tcard-grid">
        {thumbs.map((hash, i) => (
          <span key={hash + i} className="dv-tcard-cell" style={imageStyle(hash)}>
            {i === 3 ? <span className="dv-tcard-more">{more}</span> : null}
          </span>
        ))}
      </div>
      <span className="dv-tcard-title">{title}</span>
    </div>
  );
}

type RowKind = 'projects' | 'creators' | 'topics';

const ROW_COUNT: Record<RowKind, number> = {
  projects: PROJECTS.length,
  creators: CREATORS.length,
  topics: TOPICS.length,
};

/** 한 줄의 카드 묶음(한 바퀴 분량). 앞뒤로 같은 묶음을 이어 붙여 끊김 없이 이어지게 한다. */
function RowSet({ kind, center }: { kind: RowKind; center: boolean }) {
  const items = Array.from({ length: ROW_COUNT[kind] }, (_, i) => i);
  return (
    <div className="dv-cp" data-dv-center={center ? '' : undefined}>
      {items.map((i) =>
        kind === 'projects' ? (
          <ProjectCard key={i} index={i} hero={center && i === HERO_INDEX} />
        ) : kind === 'creators' ? (
          <CreatorCard key={i} index={i} />
        ) : (
          <TopicCard key={i} index={i} />
        ),
      )}
    </div>
  );
}

/** 굴러가는 세 줄(추천 프로젝트 · 크리에이터 · 주제) */
export function AgoraRows() {
  const rows: ReadonlyArray<readonly [RowKind, string]> = [
    ['projects', 'dv-r1'],
    ['creators', 'dv-r2'],
    ['topics', 'dv-r3'],
  ];
  return (
    <>
      {rows.map(([kind, cls]) => (
        <div key={kind} className={`dv-row ${cls}`} aria-hidden="true">
          <div className="dv-trk">
            <RowSet kind={kind} center={false} />
            <RowSet kind={kind} center />
            <RowSet kind={kind} center={false} />
          </div>
        </div>
      ))}
    </>
  );
}
