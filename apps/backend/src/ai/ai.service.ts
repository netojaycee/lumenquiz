import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { GameMode, QuestionType } from '@apoquiz/shared-types'
import { OllamaProvider } from './providers/ollama.provider'
import { GrokProvider } from './providers/grok.provider'
import { GeminiProvider } from './providers/gemini.provider'

export interface GeneratedQuestion {
  type: QuestionType
  text: string
  correctAnswer: string
  difficulty: 'easy' | 'medium' | 'hard'
  points: number
  aliases?: string[]
  clues?: string[]
  options?: Array<{ label: string; text: string; isCorrect: boolean }>
}

export interface ProviderStatus {
  ollama: boolean
  grok: boolean
  gemini: boolean
  activeProvider: 'ollama' | 'grok' | 'gemini' | null
}

const GAME_MODE_TYPES: Partial<Record<GameMode, QuestionType[]>> = {
  [GameMode.BLITZ]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.TILE_BLITZ]: [QuestionType.MCQ],
  [GameMode.ULTIMATE_CHALLENGE]: [QuestionType.OPEN, QuestionType.TRUEFALSE],
  [GameMode.CLUE_REVEAL]: [QuestionType.OPEN],
  [GameMode.HOT_SEAT]: [QuestionType.OPEN, QuestionType.MCQ],
  [GameMode.LIGHTNING]: [QuestionType.MCQ, QuestionType.TRUEFALSE],
  [GameMode.TRUE_FALSE_BLITZ]: [QuestionType.TRUEFALSE],
  [GameMode.WAGER]: [QuestionType.OPEN, QuestionType.MCQ],
  [GameMode.STEAL]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.DUEL]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.ELIMINATION]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.PICTURE]: [QuestionType.MCQ],
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    private readonly ollama: OllamaProvider,
    private readonly grok: GrokProvider,
    private readonly gemini: GeminiProvider,
  ) {}

  async getProviderStatus(): Promise<ProviderStatus> {
    const ollamaUp = await this.ollama.isAvailable().catch(() => false)
    const grokUp = this.grok.isConfigured()
    const geminiUp = this.gemini.isConfigured()
    const activeProvider = ollamaUp ? 'ollama' : grokUp ? 'grok' : geminiUp ? 'gemini' : null
    return { ollama: ollamaUp, grok: grokUp, gemini: geminiUp, activeProvider }
  }

  async generateQuestions(params: {
    text: string
    gameMode: string
    roundName: string
    count: number
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
    instructions?: string
  }): Promise<GeneratedQuestion[]> {
    const { text, gameMode, roundName, count, difficulty, instructions } = params

    if (!text.trim()) throw new BadRequestException('No source text provided')
    if (count < 1 || count > 30) throw new BadRequestException('Count must be between 1 and 30')

    const allowedTypes = GAME_MODE_TYPES[gameMode as GameMode] ?? [QuestionType.MCQ, QuestionType.OPEN]
    const prompt = this.buildPrompt({ text, gameMode, roundName, count, difficulty, allowedTypes, instructions })

    const raw = await this.callWithFallback(prompt)
    return this.parseResponse(raw, allowedTypes)
  }

  private buildPrompt(params: {
    text: string
    gameMode: string
    roundName: string
    count: number
    difficulty: string
    allowedTypes: QuestionType[]
    instructions?: string
  }): string {
    const { text, gameMode, roundName, count, difficulty, allowedTypes, instructions } = params
    const isClueReveal = gameMode === GameMode.CLUE_REVEAL
    const typesStr = allowedTypes.join(', ')
    const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n[...text truncated]' : text
    const primaryType = allowedTypes[0]

    return `You are a quiz question generator for Apoquiz, a church youth quiz competition.

## Round Context
- Round: ${roundName}
- Game mode: ${gameMode}
- Allowed question types: ${typesStr}
- Questions needed: ${count}
- Difficulty: ${difficulty}

## Source Material
---
${truncated}
---
${instructions ? `\n## Additional Instructions\n${instructions}\n` : ''}
## Response Format
Return ONLY a valid JSON object — no markdown fences, no explanation, no extra text:
{"questions":[...]}

Each question object must match:
{
  "type": "${primaryType}",
  "text": "Question text?",
  "correctAnswer": "the answer",
  "difficulty": "easy",
  "points": 10,
  "aliases": [],${isClueReveal ? '\n  "clues": ["hardest clue", "2nd clue", "3rd clue", "easiest clue"],' : ''}
  "options": [{"label":"A","text":"...","isCorrect":false},{"label":"B","text":"...","isCorrect":true},{"label":"C","text":"...","isCorrect":false},{"label":"D","text":"...","isCorrect":false}]
}

## Rules
- Use ONLY these question types: ${typesStr}
- mcq: exactly 4 options (A/B/C/D), exactly one isCorrect:true; correctAnswer = the correct label ("A","B","C", or "D")
- open: correctAnswer = primary answer string; aliases = array of common alternative phrasings
- truefalse: correctAnswer must be exactly "True" or "False"
- fillinblank: use ___ in the question text for the blank; correctAnswer = the missing word/phrase${isClueReveal ? '\n- clue_reveal: include "clues": array of 4 strings ordered hardest→easiest' : ''}
- points: easy=5, medium=10, hard=15
- Base ALL questions strictly on the provided source material
- Keep questions clear and appropriate for a church youth audience
- Generate exactly ${count} questions`
  }

  private async callWithFallback(prompt: string): Promise<string> {
    try {
      if (await this.ollama.isAvailable()) {
        this.logger.log('Generating via Ollama (local)')
        return await this.ollama.generate(prompt)
      }
    } catch (err) {
      this.logger.warn(`Ollama failed: ${(err as Error).message}`)
    }

    if (this.grok.isConfigured()) {
      try {
        this.logger.log('Generating via Groq API')
        return await this.grok.generate(prompt)
      } catch (err) {
        this.logger.warn(`Grok failed: ${(err as Error).message}`)
      }
    }

    if (this.gemini.isConfigured()) {
      try {
        this.logger.log('Generating via Gemini Flash')
        return await this.gemini.generate(prompt)
      } catch (err) {
        this.logger.warn(`Gemini failed: ${(err as Error).message}`)
      }
    }

    throw new BadRequestException(
      'No AI provider available. Start Ollama locally, or add GROK_API_KEY / GEMINI_API_KEY to the backend .env file.',
    )
  }

  private parseResponse(raw: string, allowedTypes: QuestionType[]): GeneratedQuestion[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new BadRequestException('AI returned unparseable output — no JSON found')
      try {
        parsed = JSON.parse(match[0])
      } catch {
        throw new BadRequestException('AI returned malformed JSON')
      }
    }

    const obj = parsed as Record<string, unknown>
    const arr = Array.isArray(obj)
      ? obj
      : Array.isArray(obj['questions'])
        ? (obj['questions'] as unknown[])
        : null

    if (!arr) throw new BadRequestException('AI response missing "questions" array')

    const valid = arr.filter((item): item is GeneratedQuestion => {
      const q = item as GeneratedQuestion
      return (
        typeof q === 'object' &&
        q !== null &&
        typeof q.text === 'string' &&
        q.text.trim().length > 0 &&
        typeof q.correctAnswer === 'string' &&
        allowedTypes.includes(q.type as QuestionType)
      )
    })

    if (valid.length === 0) {
      throw new BadRequestException('AI did not return any valid questions. Try adjusting your instructions or source material.')
    }

    return valid
  }
}
