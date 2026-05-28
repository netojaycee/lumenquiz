import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Code generation ─────────────────────────────────────────────────────────

  private readonly CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

  private randomCode(length = 6): string {
    let code = ''
    for (let i = 0; i < length; i++) {
      code += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)]
    }
    return code
  }

  private async generateUniqueSessionCode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = this.randomCode(6)
      const existing = await this.prisma.session.findUnique({ where: { sessionCode: code } })
      if (!existing) return code
    }
    throw new Error('Could not generate unique session code')
  }

  // ─── createSession — called at quiz creation time (status: pending) ──────────

  async createSession(quizId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, deletedAt: null },
      select: { id: true },
    })
    if (!quiz) throw new NotFoundException(`Quiz ${quizId} not found`)

    const sessionCode = await this.generateUniqueSessionCode()

    const teams = await this.prisma.team.findMany({
      where: { quizId, deletedAt: null },
      select: { id: true },
    })

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          quizId,
          sessionCode,
          status: 'pending',
          sessionTeams: {
            create: teams.map((t) => ({ teamId: t.id })),
          },
        },
        include: {
          sessionTeams: {
            include: { team: { select: { id: true, name: true, color: true, pin: true } } },
          },
        },
      })
      return session
    })
  }

  // ─── launchSession — transitions pending/lobby session to lobby ──────────────

  async launchSession(quizId: string) {
    let session = await this.prisma.session.findFirst({
      where: { quizId },
      orderBy: { createdAt: 'desc' },
      include: {
        sessionTeams: {
          include: { team: { select: { id: true, name: true, color: true, pin: true } } },
        },
      },
    })

    if (!session) {
      return this.createSession(quizId).then(async (s) => {
        await this.prisma.session.update({ where: { id: s.id }, data: { status: 'lobby' } })
        await this.prisma.quiz.update({ where: { id: quizId }, data: { status: 'active' } })
        return { ...s, status: 'lobby' }
      })
    }

    const allTeams = await this.prisma.team.findMany({
      where: { quizId, deletedAt: null },
      select: { id: true },
    })
    const existingTeamIds = new Set(session.sessionTeams.map((st) => st.teamId))
    const newTeams = allTeams.filter((t) => !existingTeamIds.has(t.id))
    if (newTeams.length > 0) {
      await this.prisma.sessionTeam.createMany({
        data: newTeams.map((t) => ({ sessionId: session!.id, teamId: t.id })),
      })
    }

    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: { status: 'lobby' },
      include: {
        sessionTeams: {
          include: { team: { select: { id: true, name: true, color: true, pin: true } } },
        },
      },
    })
    await this.prisma.quiz.update({ where: { id: quizId }, data: { status: 'active' } })

    return updated
  }

  // ─── getSession ───────────────────────────────────────────────────────────────

  async getSession(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        quiz: { select: { id: true, name: true } },
        sessionTeams: {
          include: {
            team: { select: { id: true, name: true, color: true } },
          },
        },
        audienceMembers: {
          where: { connected: true },
          select: { id: true, fullName: true, totalPoints: true, connected: true },
        },
      },
    })
    if (!session) throw new NotFoundException(`Session ${id} not found`)
    return session
  }

  // ─── findByCode — resolves sessionCode | raw id ───────────────────────────────

  async findByCode(code: string): Promise<{
    id: string; sessionCode: string | null; status: string; quiz: { name: string }
  } | null> {
    const upper = code.toUpperCase()

    const bySession = await this.prisma.session.findUnique({
      where: { sessionCode: upper },
      select: { id: true, sessionCode: true, status: true, quiz: { select: { name: true } } },
    })
    if (bySession) return bySession

    const byId = await this.prisma.session.findUnique({
      where: { id: code },
      select: { id: true, sessionCode: true, status: true, quiz: { select: { name: true } } },
    })
    return byId ?? null
  }

  // ─── getResults ───────────────────────────────────────────────────────────────

  async getResults(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        quiz: { select: { id: true, name: true } },
        sessionTeams: {
          include: {
            team: { select: { id: true, name: true, color: true } },
          },
          orderBy: { score: 'desc' },
        },
        audienceMembers: {
          orderBy: { totalPoints: 'desc' },
          select: { id: true, fullName: true, totalPoints: true },
        },
      },
    })
    if (!session) throw new NotFoundException(`Session ${id} not found`)

    const teamAnswers = await this.prisma.teamAnswer.findMany({
      where: { sessionId: id },
      include: {
        team: { select: { id: true, name: true } },
        question: { select: { id: true, text: true, roundId: true } },
      },
    })

    const teamStats = session.sessionTeams.map((st) => {
      const answers = teamAnswers.filter((a) => a.teamId === st.teamId)
      const correct = answers.filter((a) => a.isCorrect).length
      const wrong = answers.filter((a) => !a.isCorrect).length
      const fastest = answers
        .filter((a) => a.isCorrect)
        .sort((a, b) => b.timeRemaining - a.timeRemaining)[0]

      return {
        teamId: st.teamId,
        teamName: st.team.name,
        teamColor: st.team.color,
        totalScore: st.score,
        roundScores: JSON.parse(st.roundScores) as Record<string, number>,
        rank: st.rank,
        answeredCorrect: correct,
        answeredWrong: wrong,
        unanswered: 0,
        fastestAnswerMs: fastest?.timeRemaining ?? null,
        accuracy: answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0,
      }
    })

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        quizName: session.quiz.name,
        status: session.status,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
      },
      teams: teamStats,
      audience: {
        totalMembers: session.audienceMembers.length,
        leaderboard: session.audienceMembers.slice(0, 20),
      },
    }
  }

  async exportResultsCsv(id: string): Promise<string> {
    const results = await this.getResults(id)

    const header = ['Rank', 'Team', 'Score', 'Correct', 'Wrong', 'Accuracy'].join(',')
    const rows = results.teams.map((t, i) =>
      [i + 1, `"${t.teamName}"`, t.totalScore, t.answeredCorrect, t.answeredWrong, `${t.accuracy}%`].join(','),
    )

    return [header, ...rows].join('\n')
  }
}
