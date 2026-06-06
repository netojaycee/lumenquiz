import { Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { AdminGuard } from '../auth/guards/admin.guard'
import { SessionService } from './session.service'

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
}
