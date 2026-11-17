import { Controller, Get, Param } from '@nestjs/common';
import {
  type CompareResponse,
  type CreatorProfileResponse,
  IdSchema,
  type IdentityResponse,
} from '@tome/shared';
import { ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { IdentityService } from './identity.service';

const IdParam = () => Param('id', new ZodValidationPipe(IdSchema));

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get('creators/:id')
  profile(
    @CurrentSession() auth: AuthContext,
    @IdParam() id: string,
  ): Promise<CreatorProfileResponse> {
    return this.identity.getProfile(auth, id);
  }

  @Get('creators/:id/identity')
  identityOf(
    @CurrentSession() auth: AuthContext,
    @IdParam() id: string,
  ): Promise<IdentityResponse> {
    return this.identity.getIdentity(auth, id);
  }

  @Get('identity/compare')
  compare(@CurrentSession() auth: AuthContext): Promise<CompareResponse> {
    return this.identity.getCompare(auth);
  }
}
