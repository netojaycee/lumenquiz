import './session.types'
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { SyncService, SyncPayload } from './sync.service'
import { AuthService } from '../auth/auth.service'

interface PushBody {
  quizId?: string
  sessionId?: string
  /** Optional one-time admin password for calls from non-admin-session contexts (moderator panel). */
  adminPassword?: string
}

@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly auth: AuthService,
  ) {}

  // ─── Cloud config (admin-only) ────────────────────────────────────────────────

  @Get('config')
  @HttpCode(200)
  getCloudConfig(@Req() req: Request) {
    const session = req.session as { isAdmin?: boolean }
    if (!session.isAdmin) throw new UnauthorizedException()
    return {
      cloudUrl: this.auth.getCloudUrl() ?? '',
      cloudApiKey: this.auth.getCloudApiKey() ? '••••••••' : '',
      hasKey: !!this.auth.getCloudApiKey(),
    }
  }

  @Post('config')
  @HttpCode(200)
  setCloudConfig(@Req() req: Request, @Body() body: { cloudUrl: string; cloudApiKey?: string }) {
    const session = req.session as { isAdmin?: boolean }
    if (!session.isAdmin) throw new UnauthorizedException()
    this.auth.setCloudConfig(body.cloudUrl.trim(), body.cloudApiKey?.trim())
    return { ok: true }
  }

  // ─── Push (local → cloud) ────────────────────────────────────────────────────

  @Post('push')
  @HttpCode(200)
  async push(@Req() req: Request, @Body() body: PushBody) {
    const session = req.session as { isAdmin?: boolean }
    const isAdminSession = session.isAdmin === true
    const isPasswordOk =
      body.adminPassword !== undefined && this.auth.validateAdminPassword(body.adminPassword)

    if (!isAdminSession && !isPasswordOk) {
      throw new UnauthorizedException('Admin credentials required to sync')
    }

    const quizId = await this.sync.resolveQuizId(body)
    return this.sync.pushToCloud(quizId)
  }

  // ─── Import (cloud receives) ──────────────────────────────────────────────────
  // Protected by SYNC_API_KEY env var — not admin session, so external callers can POST.

  @Post('import')
  @HttpCode(200)
  async importPayload(
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: SyncPayload,
  ) {
    const syncKey = process.env['SYNC_API_KEY']
    if (!syncKey) {
      throw new UnauthorizedException('SYNC_API_KEY not configured on this server')
    }

    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== syncKey) {
      throw new UnauthorizedException('Invalid sync API key')
    }

    if (payload?.schemaVersion !== 1) {
      throw new UnauthorizedException('Unsupported sync schema version')
    }

    const result = await this.sync.importPayload(payload)
    return { ok: true, ...result }
  }
}
