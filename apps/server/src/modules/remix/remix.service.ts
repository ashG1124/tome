import { Injectable } from '@nestjs/common';
import {
  type Connection,
  type ConnectionListResponse,
  type ConnectionStatus,
  type CreatorSummary,
  type DismissConnectionResponse,
  NodeSnapshotSchema,
  type RemixCandidate,
  type RemixCandidatesResponse,
  type SetRemixPartnerResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import { AgoraService } from '../agora/agora.service';
import { creatorAvatarUrl } from '../avatars/avatar-url';
import { EventsService } from '../events/events.service';
import { IdentityService } from '../identity/identity.service';
import type { AuthContext } from '../session/auth.decorators';
import { type CreatorRow, RemixRepository, type RemixProjectRow } from './remix.repository';
import {
  CONNECTION_RULES,
  compareByEvidence,
  planConnections,
  renderSentence,
  type TemplateKey,
} from './remix.rules';

const CANDIDATE_LIMIT = 20;

function toSummary(row: CreatorRow): CreatorSummary {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: creatorAvatarUrl(row),
  };
}

/** 없거나 지워졌거나 숨겨졌으면 404, 남의 것이면 403 (이 순서). */
function requireOwnedProject(project: RemixProjectRow | null, auth: AuthContext): RemixProjectRow {
  if (!project || project.deletedAt !== null || project.hiddenAt !== null) {
    throw new AppError('NOT_FOUND');
  }
  if (project.ownerId !== auth.creatorId) throw new AppError('FORBIDDEN');
  return project;
}

interface StoredConnection {
  id: string;
  nodeId: string;
  predictedAction: string;
  templateKey: string;
  evidenceCount: number;
  evidenceTotal: number;
  status: ConnectionStatus;
}

/** 근거 비율이 큰 순(동률이면 nodeId 순)으로 응답 모양을 만든다. 문장은 템플릿과 근거 수치로 만든다. */
function toConnections(rows: StoredConnection[]): Connection[] {
  return [...rows].sort(compareByEvidence).map((row) => ({
    id: row.id,
    nodeId: row.nodeId,
    predictedAction: row.predictedAction,
    sentence: renderSentence(row.templateKey as TemplateKey, row.evidenceCount, row.evidenceTotal),
    status: row.status,
  }));
}

@Injectable()
export class RemixService {
  constructor(
    private readonly repo: RemixRepository,
    private readonly agora: AgoraService,
    private readonly identity: IdentityService,
    private readonly events: EventsService,
  ) {}

  // ---- 후보·즐겨찾기 ----

  async candidates(
    auth: AuthContext,
    tab: 'rising' | 'favorite',
  ): Promise<RemixCandidatesResponse> {
    const favoriteIds = await this.repo.listFavoriteIds(auth.creatorId);
    let rows: CreatorRow[];
    if (tab === 'favorite') {
      rows = await this.eligibleInOrder(auth.creatorId, favoriteIds);
    } else {
      const rising = await this.agora.listRisingCreators({
        limit: CANDIDATE_LIMIT,
        excludeCreatorId: auth.creatorId,
      });
      rows = await this.eligibleInOrder(
        auth.creatorId,
        rising.map((creator) => creator.id),
      );
      if (rows.length === 0) {
        rows = await this.repo.listEligibleBySeedOrder(auth.creatorId, CANDIDATE_LIMIT);
      }
    }
    const favorites = new Set(favoriteIds);
    const snapshots = await this.identity.latestSnapshots(rows.map((row) => row.id));
    const creators: RemixCandidate[] = rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      bio: row.bio,
      avatarUrl: creatorAvatarUrl(row),
      favorite: favorites.has(row.id),
      provisional: snapshots.get(row.id)?.provisional ?? true,
    }));
    return { creators };
  }

  /** 자격 없는 사람을 걸러내고, 넘겨받은 id 순서를 지킨다. */
  private async eligibleInOrder(meId: string, ids: string[]): Promise<CreatorRow[]> {
    const rows = new Map((await this.repo.listEligible(ids, meId)).map((row) => [row.id, row]));
    return ids.flatMap((id) => rows.get(id) ?? []);
  }

  async addFavorite(auth: AuthContext, targetId: string): Promise<void> {
    if (targetId === auth.creatorId) {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [{ path: 'creatorId', message: 'Choose another creator.' }],
      });
    }
    if (!(await this.repo.findCreator(targetId))) throw new AppError('NOT_FOUND');
    await this.repo.addFavorite(auth.creatorId, targetId);
  }

  async removeFavorite(auth: AuthContext, targetId: string): Promise<void> {
    await this.repo.removeFavorite(auth.creatorId, targetId);
  }

  // ---- 상대 지정 ----

  async setPartner(
    auth: AuthContext,
    projectId: string,
    partnerId: string | null,
  ): Promise<SetRemixPartnerResponse> {
    requireOwnedProject(await this.repo.findProject(projectId), auth);
    if (partnerId === null) {
      await this.repo.setPartner(projectId, { remixPartnerId: null, remixPartnerSnapshotId: null });
      return { remix: null };
    }
    const partner = partnerId === auth.creatorId ? null : await this.repo.findCreator(partnerId);
    if (!partner || partner.kind === 'visitor') {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [{ path: 'partnerId', message: 'Choose another creator.' }],
      });
    }
    if (!partner.identityPublic) throw new AppError('IDENTITY_PRIVATE');

    const { id: snapshotId } = await this.identity.ensureSnapshotRecord(partnerId);
    await this.repo.transaction(async (tx) => {
      await this.repo.setPartner(
        projectId,
        { remixPartnerId: partnerId, remixPartnerSnapshotId: snapshotId },
        tx,
      );
      await this.events.recordServerEvent(tx, {
        type: 'remix_partner_select',
        creatorId: auth.creatorId,
        sessionId: auth.sessionId,
        projectId,
        payload: { partnerId, snapshotId },
      });
    });
    return { remix: { partner: toSummary(partner), snapshotId } };
  }

  // ---- Connection ----

  async listConnections(
    auth: AuthContext,
    answerId: string,
    partnerIdParam: string | undefined,
  ): Promise<ConnectionListResponse> {
    const answer = await this.repo.findAnswer(answerId);
    if (!answer) throw new AppError('NOT_FOUND');
    const project = requireOwnedProject(answer.project, auth);
    const currentPartnerId = project.remixPartnerId;
    const partnerId = partnerIdParam ?? currentPartnerId;
    if (partnerId === null) throw new AppError('NO_PARTNER');

    // 현재 상대가 아닌 사람은 이미 저장된 것만 돌려준다.
    const stored = async (): Promise<ConnectionListResponse> => ({
      connections: toConnections(await this.repo.listConnections(answerId, partnerId)),
    });
    if (partnerId !== currentPartnerId) return stored();

    const snapshotId = await this.pinnedSnapshotId(project, partnerId);
    // 읽는 사이 상대가 바뀌었다면 현재 상대 기준으로 계산하지 않는다.
    if (snapshotId === null) return stored();
    const partnerRecord = await this.identity.findSnapshotById(snapshotId);
    if (!partnerRecord) throw new AppError('NOT_FOUND');
    const mine = (await this.identity.latestSnapshots([auth.creatorId])).get(auth.creatorId);
    const partnerSignals = await this.identity.axisSignalsAsOf(
      partnerId,
      new Date(partnerRecord.snapshot.computedAt),
    );
    const planned = planConnections({
      nodes: NodeSnapshotSchema.parse(answer.nodes).nodes,
      partnerAxes: partnerRecord.snapshot.axes,
      myAxes: mine?.axes ?? null,
      partnerSignals,
    });

    return this.repo.transaction(async (tx) => {
      // 같은 답변의 동시 계산은 잠금으로 한 줄로 세운다(상한 5개를 넘지 않게).
      await this.repo.lockAnswer(tx, answerId);
      const existing = await this.repo.listConnections(answerId, partnerId, tx);
      const taken = new Set(existing.map((row) => row.nodeId));
      const slots = Math.max(0, CONNECTION_RULES.MAX_PER_ANSWER - existing.length);
      const fresh = planned.filter((item) => !taken.has(item.nodeId)).slice(0, slots);
      await this.repo.insertConnections(
        tx,
        fresh.map((item) => ({
          answerId,
          nodeId: item.nodeId,
          partnerId,
          partnerSnapshotId: snapshotId,
          predictedAction: item.predictedAction,
          templateKey: item.templateKey,
          evidenceCount: item.evidenceCount,
          evidenceTotal: item.evidenceTotal,
          axis: item.axis,
        })),
      );
      return {
        connections: toConnections(await this.repo.listConnections(answerId, partnerId, tx)),
      };
    });
  }

  /**
   * 프로젝트에 고정된 상대 스냅샷 id. 생성 때 상대를 정해 비어 있으면 그때 한 번 고정한다.
   * 그 사이 상대가 바뀌어 고정할 수 없으면 null.
   */
  private async pinnedSnapshotId(
    project: RemixProjectRow,
    partnerId: string,
  ): Promise<string | null> {
    if (project.remixPartnerSnapshotId !== null) return project.remixPartnerSnapshotId;
    const { id } = await this.identity.ensureSnapshotRecord(partnerId);
    await this.repo.pinSnapshotIfMissing(project.id, partnerId, id);
    const fresh = await this.repo.findProject(project.id);
    return fresh?.remixPartnerId === partnerId ? fresh.remixPartnerSnapshotId : null;
  }

  async dismiss(auth: AuthContext, id: string): Promise<DismissConnectionResponse> {
    const found = await this.repo.findConnectionWithProject(id);
    if (!found) throw new AppError('NOT_FOUND');
    requireOwnedProject(found.project, auth);
    const status = await this.repo.transaction(async (tx) => {
      if (await this.repo.dismissIfShown(tx, id)) {
        await this.events.recordServerEvent(tx, {
          type: 'connection_dismiss',
          creatorId: auth.creatorId,
          sessionId: auth.sessionId,
          projectId: found.projectId,
          setId: found.setId,
          answerId: found.answerId,
          payload: { connectionId: id, nodeId: found.nodeId },
        });
        return 'dismissed' as const;
      }
      const current = await this.repo.findConnectionStatus(id, tx);
      return current?.status ?? 'dismissed';
    });
    return { status };
  }
}
