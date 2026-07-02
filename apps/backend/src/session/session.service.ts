import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
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

  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = this.randomCode(8)
      const existing = await this.prisma.team.findUnique({ where: { joinCode: code } })
      if (!existing) return code
    }
    throw new Error('Could not generate unique join code')
  }

  // ─── Quiz launch validation ───────────────────────────────────────────────────

  private async validateQuizCanLaunch(quizId: string): Promise<void> {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, deletedAt: null },
      include: {
        teams: { where: { deletedAt: null }, select: { id: true } },
        rounds: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            order: true,
            gameMode: true,
            questionCount: true,
            questions: { where: { deletedAt: null }, select: { id: true } },
          },
        },
      },
    })
    if (!quiz) throw new NotFoundException(`Quiz ${quizId} not found`)

    const teamCount = quiz.teams.length
    const errors: string[] = []

    if (teamCount === 0) errors.push('No teams added — add at least one team')
    if (quiz.rounds.length === 0) errors.push('No rounds added — add at least one round')

    for (const round of quiz.rounds) {
      const actual = round.questions.length
      const needed = round.questionCount
      const label = round.name ?? `Round ${round.order}`
      const mode = round.gameMode

      // Collective modes: all teams answer same questions.
      // Blitz requires 3 extra questions above questionCount so the system can
      // draw from them for a Sudden Victory tiebreaker round if needed.
      if (mode === 'blitz' || mode === 'clue_reveal') {
        const minRequired = mode === 'blitz' ? needed + 3 : needed
        if (actual < minRequired) {
          errors.push(
            mode === 'blitz'
              ? `"${label}" (blitz) needs ${minRequired} questions (${needed} for the round + 3 reserve for Sudden Victory) — only ${actual} added`
              : `"${label}" (clue reveal) needs ${needed} question${needed !== 1 ? 's' : ''} — only ${actual} added`,
          )
        }
      }
      // Per-team modes: each team gets their own set of questions
      else if (mode === 'tile_blitz' || mode === 'ultimate_challenge') {
        if (teamCount > 0) {
          const required = needed * teamCount
          if (actual < required) {
            errors.push(
              `"${label}" (${mode.replace('_', ' ')}) needs ${required} questions (${teamCount} teams × ${needed}) — only ${actual} added`,
            )
          }
        }
      }
      // Fallback for any other mode: require at least questionCount
      else if (actual < needed) {
        errors.push(
          `"${label}" needs ${needed} question${needed !== 1 ? 's' : ''} — only ${actual} added`,
        )
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Quiz is not ready to launch', errors })
    }
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
    await this.validateQuizCanLaunch(quizId)

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

  // ─── getConnectedAudience — returns names of currently connected audience members ──

  async getConnectedAudience(sessionId: string) {
    return this.prisma.audienceMember.findMany({
      where: { sessionId, connected: true },
      select: { id: true, fullName: true, totalPoints: true },
      orderBy: { joinedAt: 'asc' },
    })
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
          include: { team: { select: { id: true, name: true, color: true } } },
          orderBy: { score: 'desc' },
        },
        audienceMembers: {
          orderBy: { totalPoints: 'desc' },
          select: { id: true, fullName: true, totalPoints: true },
        },
      },
    })
    if (!session) throw new NotFoundException(`Session ${id} not found`)

    const [teamAnswers, rounds] = await Promise.all([
      this.prisma.teamAnswer.findMany({
        where: { sessionId: id },
        include: { team: { select: { id: true, name: true, color: true } } },
      }),
      this.prisma.round.findMany({
        where: { quizId: session.quizId, deletedAt: null },
        include: {
          questions: {
            where: { deletedAt: null },
            include: { options: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      }),
    ])

    const answeredQuestionIds = new Set(teamAnswers.map((a) => a.questionId))

    const teamStats = session.sessionTeams.map((st) => {
      const answers = teamAnswers.filter((a) => a.teamId === st.teamId)
      const correct = answers.filter((a) => a.isCorrect).length
      const wrong = answers.filter((a) => !a.isCorrect).length
      const fastestCorrect = answers
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
        fastestAnswerMs: fastestCorrect?.timeRemaining ?? null,
        accuracy: answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0,
      }
    })

    // Only include rounds that had at least one question answered in this session
    const roundDetail = rounds
      .filter((r) => r.questions.some((q) => answeredQuestionIds.has(q.id)))
      .map((r) => ({
        id: r.id,
        name: r.name,
        gameMode: r.gameMode,
        order: r.order,
        timerSeconds: r.timerSeconds,
        pointsPerQuestion: r.pointsPerQuestion,
        questions: r.questions
          .filter((q) => answeredQuestionIds.has(q.id))
          .map((q) => {
            const qAnswers = teamAnswers.filter((a) => a.questionId === q.id)
            return {
              id: q.id,
              order: q.order,
              text: q.text,
              type: q.type,
              correctAnswer: q.correctAnswer,
              points: q.points,
              options: q.options.map((o) => ({ label: o.label, text: o.text, isCorrect: o.isCorrect })),
              teamAnswers: qAnswers.map((a) => ({
                teamId: a.teamId,
                teamName: a.team.name,
                teamColor: a.team.color,
                submittedAnswer: a.submittedAnswer,
                isCorrect: a.isCorrect,
                pointsEarned: a.pointsEarned,
                timeRemaining: a.timeRemaining,
                submittedAt: a.submittedAt,
              })),
            }
          }),
      }))

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
      rounds: roundDetail,
      audience: {
        totalMembers: session.audienceMembers.length,
        leaderboard: session.audienceMembers.slice(0, 20),
      },
    }
  }

  async exportResultsCsv(id: string): Promise<string> {
    const results = await this.getResults(id)

    const lines: string[] = []

    lines.push('=== SESSION RESULTS ===')
    lines.push(`Quiz,${results.session.quizName}`)
    lines.push(`Session Code,${results.session.sessionCode ?? 'N/A'}`)
    lines.push(`Date,${new Date(results.session.createdAt).toLocaleString()}`)
    lines.push(`Ended,${results.session.endedAt ? new Date(results.session.endedAt).toLocaleString() : 'N/A'}`)
    lines.push('')

    lines.push('=== TEAM STANDINGS ===')
    lines.push(['Rank', 'Team', 'Total Score', 'Correct', 'Wrong', 'Accuracy'].join(','))
    results.teams.forEach((t, i) => {
      lines.push([i + 1, `"${t.teamName}"`, t.totalScore, t.answeredCorrect, t.answeredWrong, `${t.accuracy}%`].join(','))
    })
    lines.push('')

    lines.push('=== QUESTION BREAKDOWN ===')
    lines.push(['Round', 'Q#', 'Question', 'Team', 'Submitted Answer', 'Correct Answer', 'Result', 'Points', 'Time Remaining (ms)'].join(','))
    for (const round of results.rounds) {
      const roundLabel = round.name ?? `Round ${round.order}`
      for (const q of round.questions) {
        for (const a of q.teamAnswers) {
          lines.push([
            `"${roundLabel}"`,
            q.order,
            `"${q.text.replace(/"/g, '""')}"`,
            `"${a.teamName}"`,
            `"${a.submittedAnswer}"`,
            `"${q.correctAnswer}"`,
            a.isCorrect ? 'Correct' : 'Wrong',
            a.pointsEarned,
            a.timeRemaining,
          ].join(','))
        }
        if (q.teamAnswers.length === 0) {
          lines.push([`"${roundLabel}"`, q.order, `"${q.text.replace(/"/g, '""')}"`, '(no answers)', '', `"${q.correctAnswer}"`, '', '', ''].join(','))
        }
      }
    }
    lines.push('')

    if (results.audience.leaderboard.length > 0) {
      lines.push('=== AUDIENCE LEADERBOARD ===')
      lines.push(['Rank', 'Name', 'Points'].join(','))
      results.audience.leaderboard.forEach((e, i) => {
        lines.push([i + 1, `"${e.fullName}"`, e.totalPoints].join(','))
      })
    }

    return lines.join('\n')
  }

  // ─── resetTeamSlot — admin override to re-seat a team on a new device ─────────
  // Clears the device token (so a new device can claim the slot) and issues a fresh
  // join code (so the old code is invalidated and cannot be replayed by anyone who
  // had it). Returns the new join code so the host can hand it to the team.

  async resetTeamSlot(sessionId: string, teamId: string): Promise<{ teamId: string; newJoinCode: string }> {
    const st = await this.prisma.sessionTeam.findFirst({
      where: { sessionId, teamId },
    })
    if (!st) throw new NotFoundException(`Team ${teamId} is not in session ${sessionId}`)

    const newJoinCode = await this.generateUniqueJoinCode()

    await this.prisma.$transaction([
      this.prisma.sessionTeam.updateMany({
        where: { sessionId, teamId },
        data: { deviceToken: null, connected: false, socketId: null },
      }),
      this.prisma.team.update({
        where: { id: teamId },
        data: { joinCode: newJoinCode },
      }),
    ])

    return { teamId, newJoinCode }
  }

  // ─── generateTokenForTeam — issues a fresh 64-char hex device token ──────────

  static generateDeviceToken(): string {
    return randomBytes(32).toString('hex')
  }
}
