import type { GameModeStrategy, RevealResult } from '../interfaces/game-mode-strategy.interface'
import type { ScoreParams, AnswerResult, RoundContext, Question } from '@apoquiz/shared-types'
import {
  QuestionType,
  ScoringStrategy,
  AnswerBehavior,
  AudienceActivity,
  GameState,
  GAME_CONSTANTS,
} from '@apoquiz/shared-types'
import { validateOpenAnswer } from '../validation/open-answer.validator'

export class BlitzMode implements GameModeStrategy {
  readonly name = 'blitz'
  readonly displayName = 'Blitz'
  readonly description = 'All teams race simultaneously. Speed is rewarded.'
  readonly rules = [
    'All teams see the question at the same time',
    'Answer as fast as you can — earlier answers earn more points',
    'Wrong answer = 0 points. No answer = 0 points',
    'The clock starts the moment the question appears',
  ]
  readonly compatibleQuestionTypes: QuestionType[] = [QuestionType.MCQ, QuestionType.OPEN]
  readonly defaultTimerSeconds = GAME_CONSTANTS.BLITZ_DEFAULT_TIMER_SECONDS
  readonly defaultPointsPerQuestion = GAME_CONSTANTS.BLITZ_DEFAULT_POINTS
  readonly scoringStrategy = ScoringStrategy.TIME_DECAY
  readonly answerBehavior = AnswerBehavior.SIMULTANEOUS
  readonly audienceActivities: AudienceActivity[] = [
    AudienceActivity.ROUND_RANKING,
    AudienceActivity.QUESTION_PREDICTION,
    AudienceActivity.EMOJI_REACT,
  ]
  readonly stateMachineFlow: GameState[] = [
    GameState.LOBBY,
    GameState.AUDIENCE_VOTE,
    GameState.ROUND_INTRO,
    GameState.QUESTION_OPEN,
    GameState.QUESTION_LOCKED,
    GameState.ANSWER_REVEAL,
    GameState.QUESTION_SUMMARY,
    GameState.ROUND_SUMMARY,
    GameState.SESSION_END,
  ]

  calculateScore(params: ScoreParams): number {
    if (!params.isCorrect) return 0
    const decay = params.basePoints * (params.timeRemainingMs / params.timerDurationMs)
    return Math.max(GAME_CONSTANTS.BLITZ_MIN_POINTS_IF_CORRECT, Math.round(decay))
  }

  validateAnswer(submitted: string, question: Question): AnswerResult {
    if (question.type === QuestionType.MCQ) {
      const correct = question.options?.find((o) => o.isCorrect)
      if (!correct) return { correct: false }
      return { correct: submitted.trim().toUpperCase() === correct.label.toUpperCase() }
    }
    return validateOpenAnswer(submitted, question)
  }

  onQuestionStart(_context: RoundContext): void {
    // Blitz: no per-question setup beyond what the gateway handles
  }

  onAnswerSubmitted(
    _answer: { teamId: string; answer: string; serverTimestamp: number },
    _context: RoundContext,
  ): void {
    // Blitz: simultaneous — gateway scores each answer at submit time
  }

  onTimerElapsed(_context: RoundContext): void {
    // Blitz: gateway transitions to QUESTION_LOCKED
  }

  onReveal(_context: RoundContext): RevealResult {
    // Blitz: gateway loads answers from DB for the reveal payload
    return { teamAnswers: [] }
  }

  calculateAudienceScore(activity: AudienceActivity, isCorrect: boolean): number {
    if (!isCorrect) return 0
    if (activity === AudienceActivity.QUESTION_PREDICTION) return GAME_CONSTANTS.AUDIENCE_QUESTION_PREDICTION_POINTS
    if (activity === AudienceActivity.GHOST_ANSWER) return GAME_CONSTANTS.AUDIENCE_GHOST_ANSWER_POINTS
    return 0
  }
}
