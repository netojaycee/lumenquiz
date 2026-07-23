import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SessionService } from '../session/session.service'
import { CreateQuizDto } from './dto/create-quiz.dto'
import { UpdateQuizDto } from './dto/update-quiz.dto'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'
import { CreateRoundDto } from './dto/create-round.dto'
import { UpdateRoundDto } from './dto/update-round.dto'
import { CreateQuestionDto } from './dto/create-question.dto'
import { UpdateQuestionDto } from './dto/update-question.dto'

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  // ─── Quiz ────────────────────────────────────────────────────────────────────

  async createQuiz(dto: CreateQuizDto & { areaName?: string | null }) {
    const quiz = await this.prisma.quiz.create({
      data: {
        name: dto.name,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        areaName: dto.areaName || null,
      },
      select: { id: true, name: true, description: true, date: true, status: true, areaName: true, createdAt: true },
    })

    // Auto-create a fixed session for this quiz (code is permanent from creation)
    const session = await this.sessionService.createSession(quiz.id)
    return {
      ...quiz,
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        status: session.status,
      },
    }
  }

  async listQuizzes(userRole: string, areaName: string | null, areaFilter?: string | null) {
    const whereCondition: any = { deletedAt: null }
    if (userRole === 'ADMIN') {
      // areaFilter='__national__' or undefined → show national (null); any other value → show that area
      whereCondition.areaName = (areaFilter && areaFilter !== '__national__') ? areaFilter : null
    } else {
      whereCondition.areaName = areaName
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        date: true,
        status: true,
        areaName: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rounds: true, teams: true, sessions: true } },
      },
    })
    return quizzes
  }

  async getQuiz(id: string, userRole?: string, areaName?: string | null) {
    const whereCondition: any = { id, deletedAt: null }
    if (userRole === 'ADMIN') {
      whereCondition.areaName = null
    } else if (userRole) {
      whereCondition.areaName = areaName
    }

    const quiz = await this.prisma.quiz.findFirst({
      where: whereCondition,
      include: {
        teams: {
          where: { deletedAt: null },
          include: { members: true },
          orderBy: { createdAt: 'asc' },
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
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, sessionCode: true, status: true },
        },
      },
    })
    if (!quiz) throw new NotFoundException(`Quiz ${id} not found`)
    return quiz
  }

  async updateQuiz(id: string, dto: UpdateQuizDto, userRole?: string, areaName?: string | null) {
    await this.assertQuizExists(id, userRole, areaName)
    return this.prisma.quiz.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        status: dto.status,
      },
      select: { id: true, name: true, description: true, date: true, status: true, updatedAt: true },
    })
  }

  async deleteQuiz(id: string, userRole?: string, areaName?: string | null) {
    await this.assertQuizExists(id, userRole, areaName)
    await this.prisma.quiz.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  // ─── Teams ───────────────────────────────────────────────────────────────────

  async createTeam(quizId: string, dto: CreateTeamDto) {
    await this.assertQuizExists(quizId)
    const pin = await this.generateUniqueTeamPin(quizId)
    const joinCode = await this.generateUniqueJoinCode()

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          quizId,
          name: dto.name,
          color: dto.color,
          pin,
          joinCode,
          members: dto.members?.length
            ? { create: dto.members.map((m) => ({ name: m.name, avatarUrl: m.avatarUrl })) }
            : undefined,
        },
        include: { members: true },
      })

      // If a pre-launch session already exists for this quiz, register the new team in it
      // so it appears in sessionTeams from the moment it's created, not only at launchSession.
      const pendingSession = await tx.session.findFirst({
        where: { quizId, status: { notIn: ['completed', 'session_end'] } },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      })
      if (pendingSession) {
        await tx.sessionTeam.create({
          data: { sessionId: pendingSession.id, teamId: team.id },
        })
      }

      return team
    })
  }

  async updateTeam(quizId: string, teamId: string, dto: UpdateTeamDto) {
    await this.assertTeamBelongsToQuiz(quizId, teamId)

    return this.prisma.$transaction(async (tx) => {
      if (dto.members !== undefined) {
        await tx.teamMember.deleteMany({ where: { teamId } })
        if (dto.members.length > 0) {
          await tx.teamMember.createMany({
            data: dto.members.map((m) => ({ teamId, name: m.name, avatarUrl: m.avatarUrl })),
          })
        }
      }
      return tx.team.update({
        where: { id: teamId },
        data: {
          name: dto.name,
          color: dto.color,
        },
        include: { members: true },
      })
    })
  }

  async deleteTeam(quizId: string, teamId: string) {
    await this.assertTeamBelongsToQuiz(quizId, teamId)
    await this.prisma.team.update({
      where: { id: teamId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  async regenerateTeamPin(quizId: string, teamId: string) {
    await this.assertTeamBelongsToQuiz(quizId, teamId)
    const pin = await this.generateUniqueTeamPin(quizId, teamId)
    return this.prisma.team.update({
      where: { id: teamId },
      data: { pin },
      select: { id: true, pin: true },
    })
  }

  async regenerateJoinCode(quizId: string, teamId: string) {
    await this.assertTeamBelongsToQuiz(quizId, teamId)
    const joinCode = await this.generateUniqueJoinCode()

    // Clear any bound device token so the team can re-join with the new code on any device
    await this.prisma.sessionTeam.updateMany({
      where: { teamId },
      data: { deviceToken: null },
    })

    return this.prisma.team.update({
      where: { id: teamId },
      data: { joinCode },
      select: { id: true, joinCode: true },
    })
  }

  // ─── Rounds ──────────────────────────────────────────────────────────────────

  async createRound(quizId: string, dto: CreateRoundDto) {
    await this.assertQuizExists(quizId)
    const lastRound = await this.prisma.round.findFirst({
      where: { quizId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const order = (lastRound?.order ?? 0) + 1

    return this.prisma.round.create({
      data: {
        quizId,
        order,
        name: dto.name,
        gameMode: dto.gameMode,
        questionCount: dto.questionCount,
        timerSeconds: dto.timerSeconds,
        pointsPerQuestion: dto.pointsPerQuestion,
        bonusPointsPerQuestion: dto.bonusPointsPerQuestion,
        isQualifier: dto.isQualifier ?? false,
      },
    })
  }

  async updateRound(quizId: string, roundId: string, dto: UpdateRoundDto) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    return this.prisma.round.update({
      where: { id: roundId },
      data: {
        name: dto.name,
        gameMode: dto.gameMode,
        questionCount: dto.questionCount,
        timerSeconds: dto.timerSeconds,
        pointsPerQuestion: dto.pointsPerQuestion,
        bonusPointsPerQuestion: dto.bonusPointsPerQuestion,
        ...(dto.isQualifier !== undefined && { isQualifier: dto.isQualifier }),
      },
    })
  }

  async updateModeratorPin(quizId: string, newPin: string): Promise<{ ok: boolean }> {
    await this.assertQuizExists(quizId)
    await this.prisma.quiz.update({
      where: { id: quizId },
      data: { moderatorPin: newPin },
    })
    return { ok: true }
  }

  async deleteRound(quizId: string, roundId: string) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    await this.prisma.round.update({
      where: { id: roundId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  async reorderRounds(quizId: string, ids: string[]) {
    await this.assertQuizExists(quizId)
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.round.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    )
    return { ok: true }
  }

  // ─── Questions ───────────────────────────────────────────────────────────────

  async createQuestion(quizId: string, roundId: string, dto: CreateQuestionDto) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      select: { pointsPerQuestion: true },
    })

    const lastQ = await this.prisma.question.findFirst({
      where: { roundId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const order = (lastQ?.order ?? 0) + 1

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          roundId,
          order,
          type: dto.type,
          text: dto.text,
          correctAnswer: dto.correctAnswer,
          aliases: JSON.stringify(dto.aliases ?? []),
          clues: JSON.stringify(dto.clues ?? []),
          fuzzyThreshold: dto.fuzzyThreshold ?? 0.85,
          points: dto.points ?? round!.pointsPerQuestion,
          difficulty: dto.difficulty ?? 'medium',
          mediaUrl: dto.mediaUrl,
        },
      })

      if (dto.options?.length) {
        await tx.mCQOption.createMany({
          data: dto.options.map((opt) => ({
            questionId: question.id,
            label: opt.label,
            text: opt.text,
            isCorrect: opt.isCorrect,
          })),
        })
      }

      return tx.question.findUnique({
        where: { id: question.id },
        include: { options: true },
      })
    })
  }

  async updateQuestion(quizId: string, roundId: string, qId: string, dto: UpdateQuestionDto) {
    await this.assertQuestionBelongsToRound(quizId, roundId, qId)

    return this.prisma.$transaction(async (tx) => {
      if (dto.options !== undefined) {
        await tx.mCQOption.deleteMany({ where: { questionId: qId } })
        if (dto.options.length > 0) {
          await tx.mCQOption.createMany({
            data: dto.options.map((opt) => ({
              questionId: qId,
              label: opt.label,
              text: opt.text,
              isCorrect: opt.isCorrect,
            })),
          })
        }
      }

      return tx.question.update({
        where: { id: qId },
        data: {
          type: dto.type,
          text: dto.text,
          correctAnswer: dto.correctAnswer,
          aliases: dto.aliases !== undefined ? JSON.stringify(dto.aliases) : undefined,
          clues: dto.clues !== undefined ? JSON.stringify(dto.clues) : undefined,
          fuzzyThreshold: dto.fuzzyThreshold,
          points: dto.points,
          difficulty: dto.difficulty,
          mediaUrl: dto.mediaUrl,
        },
        include: { options: true },
      })
    })
  }

  async deleteQuestion(quizId: string, roundId: string, qId: string) {
    await this.assertQuestionBelongsToRound(quizId, roundId, qId)
    await this.prisma.question.update({
      where: { id: qId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  async reorderQuestions(quizId: string, roundId: string, ids: string[]) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.question.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    )
    return { ok: true }
  }

  async getRoundForImport(quizId: string, roundId: string) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, pointsPerQuestion: true, gameMode: true },
    })
    return round!
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async assertQuizExists(quizId: string, userRole?: string, areaName?: string | null) {
    const whereCondition: any = { id: quizId, deletedAt: null }
    if (userRole && userRole !== 'ADMIN') {
      whereCondition.areaName = areaName
    }

    const quiz = await this.prisma.quiz.findFirst({
      where: whereCondition,
      select: { id: true },
    })
    if (!quiz) throw new NotFoundException(`Quiz ${quizId} not found`)
  }

  private async assertTeamBelongsToQuiz(quizId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, quizId, deletedAt: null },
      select: { id: true },
    })
    if (!team) throw new NotFoundException(`Team ${teamId} not found in quiz ${quizId}`)
  }

  private async assertRoundBelongsToQuiz(quizId: string, roundId: string) {
    const round = await this.prisma.round.findFirst({
      where: { id: roundId, quizId, deletedAt: null },
      select: { id: true },
    })
    if (!round) throw new NotFoundException(`Round ${roundId} not found in quiz ${quizId}`)
  }

  private async assertQuestionBelongsToRound(quizId: string, roundId: string, qId: string) {
    await this.assertRoundBelongsToQuiz(quizId, roundId)
    const question = await this.prisma.question.findFirst({
      where: { id: qId, roundId, deletedAt: null },
      select: { id: true },
    })
    if (!question) throw new NotFoundException(`Question ${qId} not found in round ${roundId}`)
  }

  private readonly JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = ''
      for (let i = 0; i < 8; i++) {
        code += this.JOIN_CODE_CHARS[Math.floor(Math.random() * this.JOIN_CODE_CHARS.length)]
      }
      const existing = await this.prisma.team.findUnique({ where: { joinCode: code } })
      if (!existing) return code
    }
    throw new ConflictException('Could not generate unique join code')
  }

  private async generateUniqueTeamPin(quizId: string, excludeTeamId?: string): Promise<string> {
    const existingPins = await this.prisma.team.findMany({
      where: {
        quizId,
        deletedAt: null,
        ...(excludeTeamId ? { id: { not: excludeTeamId } } : {}),
      },
      select: { pin: true },
    })
    const usedPins = new Set(existingPins.map((t) => t.pin))

    for (let attempts = 0; attempts < 100; attempts++) {
      const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      if (!usedPins.has(pin)) return pin
    }
    throw new ConflictException('Could not generate unique PIN — too many teams')
  }
}
