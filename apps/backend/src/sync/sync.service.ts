import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'

export interface SyncQuizData {
  id: string
  name: string
  description: string | null
  date: string | null
  status: string
  createdAt: string
}

export interface SyncTeam {
  id: string
  name: string
  color: string
  joinCode: string | null
  members: Array<{ id: string; name: string }>
}

export interface SyncRound {
  id: string
  order: number
  name: string | null
  gameMode: string
  questionCount: number
  timerSeconds: number
  pointsPerQuestion: number
  bonusPointsPerQuestion: number
  status: string
  questions: Array<{
    id: string
    order: number
    type: string
    text: string
    correctAnswer: string
    aliases: string
    fuzzyThreshold: number
    points: number
    difficulty: string
    status: string
    options: Array<{ id: string; label: string; text: string; isCorrect: boolean }>
  }>
}

export interface SyncSession {
  id: string
  sessionCode: string | null
  status: string
  createdAt: string
  endedAt: string | null
  sessionTeams: Array<{
    id: string
    teamId: string
    score: number
    roundScores: string
    rank: number | null
  }>
  teamAnswers: Array<{
    id: string
    questionId: string
    teamId: string
    submittedAnswer: string
    isCorrect: boolean
    pointsEarned: number
    timeRemaining: number
    submittedAt: string
  }>
  audienceMembers: Array<{
    id: string
    fullName: string
    totalPoints: number
    joinedAt: string
  }>
  audienceRoundPredictions: Array<{
    id: string
    audienceMemberId: string
    roundId: string
    predictedRanking: string
    pointsEarned: number
  }>
  audienceQuestionPredictions: Array<{
    id: string
    audienceMemberId: string
    questionId: string
    predictedTeamId: string
    isCorrect: boolean | null
    pointsEarned: number
  }>
}

export interface SyncPayload {
  schemaVersion: 1
  syncedAt: string
  quiz: SyncQuizData
  teams: SyncTeam[]
  rounds: SyncRound[]
  sessions: SyncSession[]
}

export type PushResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async resolveQuizId(body: { quizId?: string; sessionId?: string }): Promise<string> {
    if (body.quizId) return body.quizId
    if (body.sessionId) {
      const session = await this.prisma.session.findUniqueOrThrow({
        where: { id: body.sessionId },
        select: { quizId: true },
      })
      return session.quizId
    }
    throw new Error('Must provide quizId or sessionId')
  }

  async exportQuiz(quizId: string): Promise<SyncPayload> {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      include: {
        teams: {
          where: { deletedAt: null },
          include: { members: true },
        },
        rounds: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            questions: {
              where: { deletedAt: null },
              orderBy: { order: 'asc' },
              include: { options: true },
            },
          },
        },
        sessions: {
          include: {
            sessionTeams: true,
            audienceMembers: {
              include: {
                roundPredictions: true,
                questionPredictions: true,
              },
            },
          },
        },
      },
    })

    const sessionsWithAnswers = await Promise.all(
      quiz.sessions.map(async (s) => {
        const answers = await this.prisma.teamAnswer.findMany({ where: { sessionId: s.id } })
        return { ...s, teamAnswers: answers }
      }),
    )

    return {
      schemaVersion: 1,
      syncedAt: new Date().toISOString(),
      quiz: {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        date: quiz.date?.toISOString() ?? null,
        status: quiz.status,
        createdAt: quiz.createdAt.toISOString(),
      },
      teams: quiz.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        joinCode: t.joinCode,
        members: t.members.map((m) => ({ id: m.id, name: m.name })),
      })),
      rounds: quiz.rounds.map((r) => ({
        id: r.id,
        order: r.order,
        name: r.name,
        gameMode: r.gameMode,
        questionCount: r.questionCount,
        timerSeconds: r.timerSeconds,
        pointsPerQuestion: r.pointsPerQuestion,
        bonusPointsPerQuestion: r.bonusPointsPerQuestion,
        status: r.status,
        questions: r.questions.map((q) => ({
          id: q.id,
          order: q.order,
          type: q.type,
          text: q.text,
          correctAnswer: q.correctAnswer,
          aliases: q.aliases,
          fuzzyThreshold: q.fuzzyThreshold,
          points: q.points,
          difficulty: q.difficulty,
          status: q.status,
          options: q.options.map((o) => ({
            id: o.id,
            label: o.label,
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        })),
      })),
      sessions: sessionsWithAnswers.map((s) => ({
        id: s.id,
        sessionCode: s.sessionCode,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        sessionTeams: s.sessionTeams.map((st) => ({
          id: st.id,
          teamId: st.teamId,
          score: st.score,
          roundScores: st.roundScores,
          rank: st.rank,
        })),
        teamAnswers: s.teamAnswers.map((a) => ({
          id: a.id,
          questionId: a.questionId,
          teamId: a.teamId,
          submittedAnswer: a.submittedAnswer,
          isCorrect: a.isCorrect,
          pointsEarned: a.pointsEarned,
          timeRemaining: a.timeRemaining,
          submittedAt: a.submittedAt.toISOString(),
        })),
        audienceMembers: s.audienceMembers.map((m) => ({
          id: m.id,
          fullName: m.fullName,
          totalPoints: m.totalPoints,
          joinedAt: m.joinedAt.toISOString(),
        })),
        audienceRoundPredictions: s.audienceMembers.flatMap((m) =>
          m.roundPredictions.map((p) => ({
            id: p.id,
            audienceMemberId: p.audienceMemberId,
            roundId: p.roundId,
            predictedRanking: p.predictedRanking,
            pointsEarned: p.pointsEarned,
          })),
        ),
        audienceQuestionPredictions: s.audienceMembers.flatMap((m) =>
          m.questionPredictions.map((p) => ({
            id: p.id,
            audienceMemberId: p.audienceMemberId,
            questionId: p.questionId,
            predictedTeamId: p.predictedTeamId,
            isCorrect: p.isCorrect,
            pointsEarned: p.pointsEarned,
          })),
        ),
      })),
    }
  }

  async pushToCloud(quizId: string): Promise<PushResult> {
    const cloudUrl = this.authService.getCloudUrl()
    const apiKey = this.authService.getCloudApiKey()

    if (!cloudUrl) {
      return { ok: false, error: 'Cloud URL not configured. Set it in Settings → Cloud Sync.' }
    }
    if (!apiKey) {
      return { ok: false, error: 'Cloud API key not configured. Set it in Settings → Cloud Sync.' }
    }

    let payload: SyncPayload
    try {
      payload = await this.exportQuiz(quizId)
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read quiz data: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    try {
      const res = await fetch(`${cloudUrl.replace(/\/$/, '')}/api/sync/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          ok: false,
          error: `Cloud returned ${res.status}: ${text.slice(0, 300)}`,
        }
      }

      this.logger.log(`Synced quiz ${quizId} to ${cloudUrl}`)
      return { ok: true, message: `"${payload.quiz.name}" synced to cloud (${payload.sessions.length} session(s)).` }
    } catch (err) {
      return {
        ok: false,
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // ─── Cloud-side import ────────────────────────────────────────────────────────
  // Receives a SyncPayload and upserts all records into the database.
  // This endpoint runs on the cloud instance (PostgreSQL).

  async importPayload(payload: SyncPayload): Promise<{ imported: string }> {
    const { quiz, teams, rounds, sessions } = payload

    await this.prisma.quiz.upsert({
      where: { id: quiz.id },
      create: {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        date: quiz.date ? new Date(quiz.date) : null,
        status: quiz.status,
        createdAt: new Date(quiz.createdAt),
      },
      update: { name: quiz.name, description: quiz.description, status: quiz.status },
    })

    for (const team of teams) {
      await this.prisma.team.upsert({
        where: { id: team.id },
        create: { id: team.id, quizId: quiz.id, name: team.name, color: team.color, joinCode: team.joinCode, pin: '' },
        update: { name: team.name, color: team.color },
      })
      for (const member of team.members) {
        await this.prisma.teamMember.upsert({
          where: { id: member.id },
          create: { id: member.id, teamId: team.id, name: member.name },
          update: { name: member.name },
        })
      }
    }

    for (const round of rounds) {
      await this.prisma.round.upsert({
        where: { id: round.id },
        create: {
          id: round.id,
          quizId: quiz.id,
          order: round.order,
          name: round.name,
          gameMode: round.gameMode,
          questionCount: round.questionCount,
          timerSeconds: round.timerSeconds,
          pointsPerQuestion: round.pointsPerQuestion,
          bonusPointsPerQuestion: round.bonusPointsPerQuestion,
          status: round.status,
        },
        update: { order: round.order, name: round.name, status: round.status },
      })
      for (const q of round.questions) {
        await this.prisma.question.upsert({
          where: { id: q.id },
          create: {
            id: q.id,
            roundId: round.id,
            order: q.order,
            type: q.type,
            text: q.text,
            correctAnswer: q.correctAnswer,
            aliases: q.aliases,
            fuzzyThreshold: q.fuzzyThreshold,
            points: q.points,
            difficulty: q.difficulty,
            status: q.status,
          },
          update: { text: q.text, correctAnswer: q.correctAnswer, aliases: q.aliases, status: q.status },
        })
        for (const opt of q.options) {
          await this.prisma.mCQOption.upsert({
            where: { id: opt.id },
            create: { id: opt.id, questionId: q.id, label: opt.label, text: opt.text, isCorrect: opt.isCorrect },
            update: { text: opt.text, isCorrect: opt.isCorrect },
          })
        }
      }
    }

    for (const s of sessions) {
      await this.prisma.session.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          quizId: quiz.id,
          sessionCode: s.sessionCode,
          status: s.status,
          createdAt: new Date(s.createdAt),
          endedAt: s.endedAt ? new Date(s.endedAt) : null,
        },
        update: { status: s.status, endedAt: s.endedAt ? new Date(s.endedAt) : null },
      })

      for (const st of s.sessionTeams) {
        await this.prisma.sessionTeam.upsert({
          where: { id: st.id },
          create: { id: st.id, sessionId: s.id, teamId: st.teamId, score: st.score, roundScores: st.roundScores, rank: st.rank },
          update: { score: st.score, roundScores: st.roundScores, rank: st.rank },
        })
      }

      for (const ans of s.teamAnswers) {
        await this.prisma.teamAnswer.upsert({
          where: { id: ans.id },
          create: {
            id: ans.id,
            questionId: ans.questionId,
            teamId: ans.teamId,
            sessionId: s.id,
            submittedAnswer: ans.submittedAnswer,
            isCorrect: ans.isCorrect,
            pointsEarned: ans.pointsEarned,
            timeRemaining: ans.timeRemaining,
            submittedAt: new Date(ans.submittedAt),
          },
          update: {},
        })
      }

      for (const m of s.audienceMembers) {
        await this.prisma.audienceMember.upsert({
          where: { id: m.id },
          create: { id: m.id, sessionId: s.id, fullName: m.fullName, fingerprint: 'synced', totalPoints: m.totalPoints, joinedAt: new Date(m.joinedAt) },
          update: { totalPoints: m.totalPoints },
        })
      }

      for (const p of s.audienceRoundPredictions) {
        await this.prisma.audienceRoundPrediction.upsert({
          where: { id: p.id },
          create: { id: p.id, audienceMemberId: p.audienceMemberId, sessionId: s.id, roundId: p.roundId, predictedRanking: p.predictedRanking, pointsEarned: p.pointsEarned },
          update: { pointsEarned: p.pointsEarned },
        })
      }

      for (const p of s.audienceQuestionPredictions) {
        await this.prisma.audienceQuestionPrediction.upsert({
          where: { id: p.id },
          create: { id: p.id, audienceMemberId: p.audienceMemberId, questionId: p.questionId, predictedTeamId: p.predictedTeamId, isCorrect: p.isCorrect, pointsEarned: p.pointsEarned },
          update: { isCorrect: p.isCorrect, pointsEarned: p.pointsEarned },
        })
      }
    }

    return { imported: quiz.name }
  }
}
