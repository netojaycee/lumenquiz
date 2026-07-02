import type {
  QuestionType,
  ScoringStrategy,
  AnswerBehavior,
  AudienceActivity,
  GameState,
  ScoreParams,
  AnswerResult,
  RoundContext,
  Question,
} from '@apoquiz/shared-types'

export interface RevealResult {
  teamAnswers: Array<{
    teamId: string
    isCorrect: boolean
    pointsEarned: number
  }>
}

/**
 * Every game mode implements this interface. The session engine calls strategy
 * methods generically — no game-mode-specific logic ever lives in the gateway.
 */
export interface GameModeStrategy {
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly rules: string[]
  readonly compatibleQuestionTypes: QuestionType[]
  readonly defaultTimerSeconds: number
  readonly defaultPointsPerQuestion: number
  readonly scoringStrategy: ScoringStrategy
  readonly answerBehavior: AnswerBehavior
  readonly audienceActivities: AudienceActivity[]
  readonly stateMachineFlow: GameState[]

  calculateScore(params: ScoreParams): number
  validateAnswer(submitted: string, question: Question): AnswerResult
  onQuestionStart(context: RoundContext): void
  onAnswerSubmitted(answer: { teamId: string; answer: string; serverTimestamp: number }, context: RoundContext): void
  onTimerElapsed(context: RoundContext): void
  onReveal(context: RoundContext): RevealResult
  calculateAudienceScore(activity: AudienceActivity, isCorrect: boolean, payload?: any): number
}
