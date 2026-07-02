import type { Question, MCQOption, QuestionType, QuestionDifficulty } from '@apoquiz/shared-types'

// Matches the Prisma question shape when included with options
export interface PrismaQuestionWithOptions {
  id: string
  roundId: string
  order: number
  type: string
  text: string
  mediaUrl: string | null
  correctAnswer: string
  aliases: string          // stored as JSON array string in DB
  clues: string            // stored as JSON array string in DB
  fuzzyThreshold: number
  points: number
  difficulty: string
  status: string
  createdAt: Date
  deletedAt: Date | null
  options: Array<{
    id: string
    questionId: string
    label: string
    text: string
    isCorrect: boolean
  }>
}

export function mapPrismaQuestion(q: PrismaQuestionWithOptions): Question {
  const options: MCQOption[] = q.options.map((o) => ({
    id: o.id,
    questionId: o.questionId,
    label: o.label,
    text: o.text,
    isCorrect: o.isCorrect,
  }))

  return {
    id: q.id,
    roundId: q.roundId,
    order: q.order,
    type: q.type as QuestionType,
    text: q.text,
    mediaUrl: q.mediaUrl ?? undefined,
    correctAnswer: q.correctAnswer,
    aliases: JSON.parse(q.aliases) as string[],
    clues: JSON.parse(q.clues) as string[],
    fuzzyThreshold: q.fuzzyThreshold,
    points: q.points,
    difficulty: q.difficulty as QuestionDifficulty,
    status: q.status,
    createdAt: q.createdAt.toISOString(),
    options: options.length > 0 ? options : undefined,
  }
}
