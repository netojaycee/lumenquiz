import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { Response } from 'express'
import { AdminGuard } from '../auth/guards/admin.guard'
import { SessionService } from './session.service'

// ─── Disk-based UC audio store ────────────────────────────────────────────────
// Files written to uploads/uc-audio/ and served back directly.
// Key for gateway presence checks: `${sessionId}:${teamId}`

const AUDIO_MAX_BYTES = 10 * 1024 * 1024 // 10 MB cap per recording

function ucAudioDir(): string {
  const dir = path.join(process.cwd(), 'uploads', 'uc-audio')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function ucAudioFilePath(sessionId: string, teamId: string): string {
  return path.join(ucAudioDir(), `${sessionId}-${teamId}.webm`)
}

// Exported so the gateway can check whether audio exists for a team
export const ucAudioStore = {
  has: (key: string) => {
    const [sessionId, teamId] = key.split(':')
    return fs.existsSync(ucAudioFilePath(sessionId, teamId))
  },
}

@Controller()
export class SessionPublicController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('sessions/find/:code')
  async findByCode(@Param('code') code: string) {
    const session = await this.sessionService.findByCode(code)
    if (!session) throw new NotFoundException(`Session not found for code: ${code}`)
    return session
  }

  @Get('sessions/:id/audience')
  getConnectedAudience(@Param('id') id: string) {
    return this.sessionService.getConnectedAudience(id)
  }

  // ── UC audio upload ─────────────────────────────────────────────────────────

  @Post('sessions/:id/uc-audio/:teamId')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ucAudioDir()),
        filename: (req, _file, cb) => {
          const sessionId = (req.params as Record<string, string>)['id'] ?? 'unknown'
          const teamId = (req.params as Record<string, string>)['teamId'] ?? 'unknown'
          cb(null, `${sessionId}-${teamId}.webm`)
        },
      }),
      limits: { fileSize: AUDIO_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('audio/')) {
          return cb(new BadRequestException('Only audio files are accepted'), false)
        }
        cb(null, true)
      },
    }),
  )
  uploadUCAudio(
    @Param('id') _sessionId: string,
    @Param('teamId') _teamId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No audio file uploaded')
    return { ok: true }
  }

  // ── UC audio serve ──────────────────────────────────────────────────────────

  @Get('sessions/:id/uc-audio/:teamId')
  serveUCAudio(
    @Param('id') sessionId: string,
    @Param('teamId') teamId: string,
    @Res() res: Response,
  ) {
    const filePath = ucAudioFilePath(sessionId, teamId)
    if (!fs.existsSync(filePath)) throw new NotFoundException('No audio recording found for this team')
    res.setHeader('Content-Type', 'audio/webm')
    res.setHeader('Accept-Ranges', 'bytes')
    res.sendFile(filePath)
  }
}

@UseGuards(AdminGuard)
@Controller()
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('quiz/:quizId/sessions')
  launchSession(@Param('quizId') quizId: string) {
    return this.sessionService.launchSession(quizId)
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.sessionService.getSession(id)
  }

  @Get('sessions/:id/results')
  getResults(@Param('id') id: string) {
    return this.sessionService.getResults(id)
  }

  @Get('sessions/:id/results/export')
  async exportResults(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.sessionService.exportResultsCsv(id)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="session-${id}-results.csv"`)
    res.send(csv)
  }

  @Post('sessions/:id/teams/:teamId/reset-slot')
  resetTeamSlot(@Param('id') sessionId: string, @Param('teamId') teamId: string) {
    return this.sessionService.resetTeamSlot(sessionId, teamId)
  }
}
