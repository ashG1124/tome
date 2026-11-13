import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../session/auth.decorators';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) res: Response) {
    const body = await this.health.check();
    if (body.db === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
