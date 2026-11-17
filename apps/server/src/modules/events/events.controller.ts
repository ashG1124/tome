import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ClientEventTypeSchema,
  type EventBatchRequest,
  EventBatchRequestSchema,
  type EventBatchResponse,
} from '@tome/shared';
import { ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { EventsService } from './events.service';

/** 클라이언트는 화면 조작 종류만 보낼 수 있다. 서버 종류가 하나라도 있으면 묶음 전체가 거절된다. */
export const ClientEventBatchSchema = EventBatchRequestSchema.superRefine((batch, ctx) => {
  batch.events.forEach((event, index) => {
    if (!ClientEventTypeSchema.safeParse(event.type).success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Server-side event types cannot be sent by clients.',
        path: ['events', index, 'type'],
      });
    }
  });
});

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(200)
  ingest(
    @CurrentSession() auth: AuthContext,
    @Body(new ZodValidationPipe(ClientEventBatchSchema)) body: EventBatchRequest,
  ): Promise<EventBatchResponse> {
    return this.events.ingest(auth, body);
  }
}
