import { Injectable, BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { PrismaService } from '../prisma/prisma.service'
import { ParsedImportQuestion } from './dto/import-questions.dto'

const VALID_TYPES = ['mcq', 'open', 'truefalse', 'fillinblank', 'image']
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']

@Injectable()
export class QuizImportService {
  constructor(private readonly prisma: PrismaService) {}

  parseFile(buffer: Buffer): ParsedImportQuestion[] {
    let rows: Record<string, unknown>[]

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    } catch {
      throw new BadRequestException('Could not parse file — ensure it is a valid .xlsx or .csv file')
    }

    if (rows.length === 0) throw new BadRequestException('File is empty or has no data rows')

    return rows.map((row, index) => this.parseRow(row, index + 2))
  }

  async saveQuestions(
    roundId: string,
    questions: ParsedImportQuestion[],
    defaultPoints: number,
  ): Promise<{ saved: number; skipped: number }> {
    const validQuestions = questions.filter((q) => q.errors.length === 0)
    if (validQuestions.length === 0) return { saved: 0, skipped: questions.length }

    const lastQ = await this.prisma.question.findFirst({
      where: { roundId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    let nextOrder = (lastQ?.order ?? 0) + 1

    await this.prisma.$transaction(async (tx) => {
      for (const q of validQuestions) {
        const question = await tx.question.create({
          data: {
            roundId,
            order: nextOrder++,
            type: q.type,
            text: q.text,
            correctAnswer: q.correctAnswer,
            aliases: JSON.stringify(q.aliases),
            difficulty: q.difficulty,
            points: q.points ?? defaultPoints,
          },
        })

        if (q.options?.length) {
          await tx.mCQOption.createMany({
            data: q.options.map((opt) => ({
              questionId: question.id,
              label: opt.label,
              text: opt.text,
              isCorrect: opt.isCorrect,
            })),
          })
        }
      }
    })

    return { saved: validQuestions.length, skipped: questions.length - validQuestions.length }
  }

  private parseRow(row: Record<string, unknown>, rowNum: number): ParsedImportQuestion {
    const errors: string[] = []

    const get = (key: string): string =>
      String(row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()] ?? '').trim()

    const type = get('type').toLowerCase() || get('Type').toLowerCase()
    const text = get('text') || get('question') || get('Question')
    const correctAnswer = get('correctAnswer') || get('correct_answer') || get('answer') || get('Answer')
    const difficulty = (get('difficulty') || 'medium').toLowerCase()
    const pointsRaw = get('points')
    const aliasesRaw = get('aliases')
    const correctOption = (get('correctOption') || get('correct_option') || get('correctoption') || '').toUpperCase()

    if (!type) errors.push(`Row ${rowNum}: missing "type"`)
    else if (!VALID_TYPES.includes(type)) errors.push(`Row ${rowNum}: invalid type "${type}" — must be one of: ${VALID_TYPES.join(', ')}`)

    if (!text) errors.push(`Row ${rowNum}: missing "text"`)
    if (!correctAnswer && type !== 'mcq') errors.push(`Row ${rowNum}: missing "correctAnswer"`)
    if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) errors.push(`Row ${rowNum}: invalid difficulty "${difficulty}"`)

    const points = pointsRaw ? parseInt(pointsRaw, 10) : null
    if (pointsRaw && (isNaN(points!) || points! < 1)) errors.push(`Row ${rowNum}: "points" must be a positive integer`)

    const aliases = aliasesRaw
      ? aliasesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    let options: ParsedImportQuestion['options'] = null
    if (type === 'mcq') {
      const optA = get('optionA') || get('option_a') || get('A')
      const optB = get('optionB') || get('option_b') || get('B')
      const optC = get('optionC') || get('option_c') || get('C')
      const optD = get('optionD') || get('option_d') || get('D')

      if (!optA || !optB || !optC || !optD) {
        errors.push(`Row ${rowNum}: MCQ requires columns optionA, optionB, optionC, optionD`)
      }
      if (!correctOption || !['A', 'B', 'C', 'D'].includes(correctOption)) {
        errors.push(`Row ${rowNum}: MCQ requires "correctOption" (A, B, C, or D)`)
      }

      if (optA && optB && optC && optD && ['A', 'B', 'C', 'D'].includes(correctOption)) {
        const optMap: Record<string, string> = { A: optA, B: optB, C: optC, D: optD }
        options = (['A', 'B', 'C', 'D'] as const).map((label) => ({
          label,
          text: optMap[label],
          isCorrect: label === correctOption,
        }))
        // For MCQ, correctAnswer = the label of the correct option
        // We'll derive it from the option map
      }
    }

    const resolvedCorrectAnswer =
      type === 'mcq' && options
        ? options.find((o) => o.isCorrect)?.text ?? correctAnswer
        : correctAnswer

    return {
      order: rowNum - 1,
      type: type || 'open',
      text,
      correctAnswer: resolvedCorrectAnswer,
      aliases,
      difficulty: VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium',
      points,
      options,
      errors,
    }
  }
}
