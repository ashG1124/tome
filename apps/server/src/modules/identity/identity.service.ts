import { Injectable } from '@nestjs/common';
import {
  type CompareEntry,
  type CompareResponse,
  type CreatorProfileResponse,
  type CreatorSummary,
  type IdentityAxes,
  IdentityAxesSchema,
  IdentityMetricsSchema,
  type IdentityResponse,
  type IdentitySnapshot,
} from '@tome/shared';
import { AppError } from '../../common';
import type { Prisma } from '../../generated/prisma/client';
import { EventsService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import type { AuthContext } from '../session/auth.decorators';
import {
  ALGO_VERSION,
  type CalcEvent,
  type CalcResult,
  calculateIdentity,
  type EventOrigin,
} from './identity-calc';
import { IdentityRepository, type IdentityCreatorRow, type Tx } from './identity.repository';

const AXIS_ORDER = ['scaleIntensity', 'aiRelation', 'decisionBasis', 'direction'] as const;

function toCreatorSummary(row: IdentityCreatorRow): CreatorSummary {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: null,
  };
}

interface StoredSnapshot {
  algoVersion: string;
  axes: Prisma.JsonValue;
  metrics: Prisma.JsonValue;
  eventCount: number;
  projectCount: number;
  provisional: boolean;
  computedAt: Date;
}

function toSnapshot(row: StoredSnapshot): IdentitySnapshot {
  return {
    algoVersion: row.algoVersion,
    axes: IdentityAxesSchema.parse(row.axes),
    metrics: IdentityMetricsSchema.parse(row.metrics),
    eventCount: row.eventCount,
    projectCount: row.projectCount,
    provisional: row.provisional,
    computedAt: row.computedAt.toISOString(),
  };
}

interface Gathered {
  result: CalcResult;
  lastEventAt: Date | null;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly events: EventsService,
    private readonly projects: ProjectsService,
  ) {}

  async getProfile(auth: AuthContext, creatorId: string): Promise<CreatorProfileResponse> {
    const creator = await this.requireCreator(creatorId);
    const works = await this.projects.listPosted(creatorId);
    const visible = creatorId === auth.creatorId || creator.identityPublic;
    return {
      creator: toCreatorSummary(creator),
      works,
      identity: visible ? await this.ensureSnapshot(creatorId) : null,
    };
  }

  async getIdentity(auth: AuthContext, creatorId: string): Promise<IdentityResponse> {
    const creator = await this.requireCreator(creatorId);
    if (creatorId !== auth.creatorId && !creator.identityPublic) {
      throw new AppError('IDENTITY_PRIVATE');
    }
    const snapshot = await this.ensureSnapshot(creatorId);
    return {
      snapshot,
      table: AXIS_ORDER.map((axis) => ({ axis, score: snapshot.axes[axis] })),
    };
  }

  async getCompare(auth: AuthContext): Promise<CompareResponse> {
    const me = await this.requireCreator(auth.creatorId);
    const seeds = (await this.repo.listPublicSeeds()).filter((row) => row.id !== auth.creatorId);
    const entry = async (row: IdentityCreatorRow): Promise<CompareEntry> => {
      const snapshot = await this.ensureSnapshot(row.id);
      return {
        creator: toCreatorSummary(row),
        axes: snapshot.axes as IdentityAxes,
        provisional: snapshot.provisional,
      };
    };
    const meEntry = await entry(me);
    const others: CompareEntry[] = [];
    for (const seed of seeds) others.push(await entry(seed));
    return { me: meEntry, others };
  }

  /**
   * 최신 스냅샷이 아직 맞으면 그대로, 아니면 계산해서 새 행으로 쌓고 돌려준다.
   * 같은 창작자의 동시 계산은 잠금으로 한 줄로 세워, 뒤에 온 쪽은 먼저 쌓인 행을 그대로 쓴다.
   */
  async ensureSnapshot(creatorId: string): Promise<IdentitySnapshot> {
    const gathered = await this.gather(creatorId);
    const latest = await this.repo.latestSnapshot(creatorId);
    if (latest && this.isFresh(latest, gathered)) return toSnapshot(latest);

    return this.repo.transaction(async (tx) => {
      await this.repo.lockCreator(tx, creatorId);
      const fresh = await this.gather(creatorId, tx);
      const current = await this.repo.latestSnapshot(creatorId, tx);
      if (current && this.isFresh(current, fresh)) return toSnapshot(current);
      const { result } = fresh;
      const row = await this.repo.insertSnapshot(tx, {
        creatorId,
        algoVersion: ALGO_VERSION,
        axes: result.axes as Prisma.InputJsonObject,
        metrics: result.metrics as unknown as Prisma.InputJsonObject,
        eventCount: result.eventCount,
        projectCount: result.projectCount,
        provisional: result.provisional,
        computedAt: new Date(),
      });
      return toSnapshot(row);
    });
  }

  private isFresh(snapshot: StoredSnapshot, gathered: Gathered): boolean {
    return (
      snapshot.algoVersion === ALGO_VERSION &&
      snapshot.eventCount === gathered.result.eventCount &&
      snapshot.projectCount === gathered.result.projectCount &&
      (gathered.lastEventAt === null || gathered.lastEventAt <= snapshot.computedAt)
    );
  }

  private async gather(creatorId: string, tx?: Tx): Promise<Gathered> {
    const owned = await this.repo.listOwnedProjects(creatorId, tx);
    const byId = new Map(owned.map((project) => [project.id, project]));
    const rows = await this.events.listForIdentity(creatorId);
    const events: CalcEvent[] = [];
    let lastEventAt: Date | null = null;
    for (const row of rows) {
      let origin: EventOrigin = 'own';
      if (row.projectId !== null) {
        const project = byId.get(row.projectId);
        if (!project) continue; // 남의 프로젝트에서 남긴 이벤트는 내 기록이 아니다.
        origin = project.kind === 'derive' ? 'derived' : project.remixPartnerId ? 'remix' : 'own';
      }
      if (lastEventAt === null || row.serverTs > lastEventAt) lastEventAt = row.serverTs;
      events.push({
        type: row.type,
        sessionId: row.sessionId,
        serverTs: row.serverTs,
        setId: row.setId,
        origin,
        payload:
          typeof row.payload === 'object' && row.payload !== null && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {},
      });
    }
    const setStats = await this.repo.countSets(
      owned.map((project) => project.id),
      tx,
    );
    return {
      result: calculateIdentity({ events, setStats, projectCount: owned.length }),
      lastEventAt,
    };
  }

  private async requireCreator(id: string): Promise<IdentityCreatorRow> {
    const creator = await this.repo.findCreator(id);
    if (!creator) throw new AppError('NOT_FOUND');
    return creator;
  }
}
