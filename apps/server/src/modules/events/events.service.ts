import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type EventBatchRequest,
  type EventBatchResponse,
  type EventEnvelope,
  EventPayloadSchemas,
  type ServerEventType,
} from '@tome/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../session/auth.decorators';
import { EventsRepository, type NewEventRow } from './events.repository';

export interface ServerEventInput {
  type: ServerEventType;
  creatorId: string;
  sessionId: string | null;
  projectId?: string;
  setId?: string;
  answerId?: string;
  payload?: Record<string, unknown>;
}

interface ResolvedEvent {
  event: EventEnvelope;
  projectId: string | null;
  setId: string | null;
}

@Injectable()
export class EventsService {
  constructor(private readonly events: EventsRepository) {}

  /** 클라이언트 이벤트 묶음 저장. 같은 id 는 한 번만, 읽을 수 없는 대상을 가리키는 이벤트는 그 건만 버린다. */
  async ingest(auth: AuthContext, batch: EventBatchRequest): Promise<EventBatchResponse> {
    const unique: EventEnvelope[] = [];
    const seen = new Set<string>();
    for (const event of batch.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      unique.push(event);
    }
    let duplicates = batch.events.length - unique.length;

    const valid = await this.resolveReadable(auth.creatorId, unique);
    const serverTs = new Date();
    const rows = valid.map(({ event, projectId, setId }): NewEventRow => ({
      id: event.id,
      schemaVersion: event.schemaVersion,
      type: event.type,
      creatorId: auth.creatorId,
      sessionId: auth.sessionId,
      projectId,
      setId,
      answerId: event.answerId ?? null,
      payload: event.payload as Prisma.InputJsonObject,
      clientTs: new Date(event.clientTs),
      serverTs,
      source: 'client',
    }));
    const accepted = await this.events.insertManyIgnoringDuplicates(rows);
    duplicates += rows.length - accepted;
    return { accepted, duplicates };
  }

  /** 아이덴티티 계산용 읽기. 삭제·숨김 프로젝트의 이벤트는 빠진다. 서버 시각 순. */
  listForIdentity(creatorId: string) {
    return this.events.listForCreator(creatorId);
  }

  /**
   * 서버가 변경 트랜잭션 안에서 남기는 이벤트. 트랜잭션이 되돌려지면 같이 사라진다.
   * payload 가 종류별 스키마에 맞지 않으면 던진다(호출하는 쪽 버그).
   */
  async recordServerEvent(tx: Prisma.TransactionClient, input: ServerEventInput): Promise<void> {
    const payload = EventPayloadSchemas[input.type].parse(input.payload ?? {});
    const now = new Date();
    await this.events.insertInTransaction(tx, {
      id: randomUUID(),
      schemaVersion: 1,
      type: input.type,
      creatorId: input.creatorId,
      sessionId: input.sessionId,
      projectId: input.projectId ?? null,
      setId: input.setId ?? null,
      answerId: input.answerId ?? null,
      payload: payload as Prisma.InputJsonObject,
      clientTs: now,
      serverTs: now,
      source: 'server',
    });
  }

  /**
   * project/set/answer id 가 있으면 존재하고 읽을 수 있으며 서로 맞는 것만 남긴다.
   * set·answer 만 있어도 알 수 있는 상위 id 를 채워 저장한다(프로젝트 단위로 거를 수 있게).
   */
  private async resolveReadable(
    creatorId: string,
    events: EventEnvelope[],
  ): Promise<ResolvedEvent[]> {
    const setIds = new Set<string>();
    const answerIds = new Set<string>();
    const projectIds = new Set<string>();
    for (const event of events) {
      if (event.setId) setIds.add(event.setId);
      if (event.answerId) answerIds.add(event.answerId);
      if (event.projectId) projectIds.add(event.projectId);
    }
    const answers = new Map(
      (await this.events.findAnswers([...answerIds])).map((row) => [row.id, row]),
    );
    const sets = new Map(
      (await this.events.findSets([...setIds])).map((row) => [row.id, row.projectId]),
    );
    for (const projectId of sets.values()) projectIds.add(projectId);
    for (const answer of answers.values()) projectIds.add(answer.projectId);
    const readable = await this.events.findReadableProjectIds(creatorId, [...projectIds]);

    const result: ResolvedEvent[] = [];
    for (const event of events) {
      let projectId = event.projectId ?? null;
      let setId = event.setId ?? null;

      if (event.answerId) {
        const answer = answers.get(event.answerId);
        if (!answer) continue;
        if (setId !== null && setId !== answer.setId) continue;
        if (projectId !== null && projectId !== answer.projectId) continue;
        setId = answer.setId;
        projectId = answer.projectId;
      }
      if (setId !== null) {
        const setProjectId = sets.get(setId);
        if (!setProjectId) continue;
        if (projectId !== null && projectId !== setProjectId) continue;
        projectId = setProjectId;
      }
      if (projectId !== null && !readable.has(projectId)) continue;
      result.push({ event, projectId, setId });
    }
    return result;
  }
}
