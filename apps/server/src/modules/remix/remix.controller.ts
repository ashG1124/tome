import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { IdSchema, type SetRemixPartnerRequest, SetRemixPartnerRequestSchema } from '@tome/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { RemixService } from './remix.service';

const idPipe = new ZodValidationPipe(IdSchema);
const CandidatesQuerySchema = z.object({ tab: z.enum(['rising', 'favorite']) });
type CandidatesQuery = z.infer<typeof CandidatesQuerySchema>;
const ConnectionsQuerySchema = z.object({ partnerId: IdSchema.optional() });
type ConnectionsQuery = z.infer<typeof ConnectionsQuerySchema>;

@Controller()
export class RemixController {
  constructor(private readonly remix: RemixService) {}

  @Get('remix/candidates')
  candidates(
    @CurrentSession() auth: AuthContext,
    @Query(new ZodValidationPipe(CandidatesQuerySchema)) query: CandidatesQuery,
  ) {
    return this.remix.candidates(auth, query.tab);
  }

  @Put('me/favorites/:creatorId')
  @HttpCode(204)
  async addFavorite(
    @CurrentSession() auth: AuthContext,
    @Param('creatorId', idPipe) creatorId: string,
  ): Promise<void> {
    await this.remix.addFavorite(auth, creatorId);
  }

  @Delete('me/favorites/:creatorId')
  @HttpCode(204)
  async removeFavorite(
    @CurrentSession() auth: AuthContext,
    @Param('creatorId', idPipe) creatorId: string,
  ): Promise<void> {
    await this.remix.removeFavorite(auth, creatorId);
  }

  @Put('projects/:id/remix-partner')
  setPartner(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(SetRemixPartnerRequestSchema)) body: SetRemixPartnerRequest,
  ) {
    return this.remix.setPartner(auth, id, body.partnerId);
  }

  @Get('answers/:id/connections')
  connections(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(ConnectionsQuerySchema)) query: ConnectionsQuery,
  ) {
    return this.remix.listConnections(auth, id, query.partnerId);
  }

  @Post('connections/:id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentSession() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.remix.dismiss(auth, id);
  }
}
