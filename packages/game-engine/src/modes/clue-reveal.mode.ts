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

export class ClueRevealMode implements GameModeStrategy {
  readonly name = 'clue_reveal'
  readonly displayName = 'Clue Reveal'
  readonly description =
    'The answer emerges slowly. Patience vs greed. Buzz in early for maximum points — but wrong means locked out.'
  readonly rules = [
    'Clues appear one at a time (3-5 per question)',
    'Buzz in when you think you know the answer',
    'First clue correct = maximum points',
    'Each additional clue revealed = fewer points available',
    'Buzz in wrong = locked out for this question',
    'Minimum 2 points if you answer on the last clue',
  ]
  readonly compatibleQuestionTypes: QuestionType[] = [QuestionType.OPEN]
  readonly defaultTimerSeconds = GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS
  readonly defaultPointsPerQuestion = GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_POINTS
  readonly scoringStrategy = ScoringStrategy.POSITION
  readonly answerBehavior = AnswerBehavior.BUZZER
  readonly audienceActivities: AudienceActivity[] = [AudienceActivity.EMOJI_REACT]
  readonly stateMachineFlow: GameState[] = [
    GameState.LOBBY,
    GameState.AUDIENCE_VOTE,
    GameState.ROUND_INTRO,
    GameState.CLUE_OPEN,
    GameState.CLUE_ANSWERING,
    GameState.ANSWER_REVEAL,
    GameState.ROUND_SUMMARY,
    GameState.SESSION_END,
  ]

  /** Points drop by penaltyPerClue each clue; floor at CLUE_REVEAL_MIN_POINTS. */
  calculateScore(params: ScoreParams): number {
    if (!params.isCorrect) return 0
    // clueIndex is encoded in timeRemainingMs for Clue Reveal (0 = first clue shown)
    const clueIndex = params.timeRemainingMs
    const pts = params.basePoints - clueIndex * GAME_CONSTANTS.CLUE_REVEAL_PENALTY_PER_CLUE
    return Math.max(GAME_CONSTANTS.CLUE_REVEAL_MIN_POINTS, pts)
  }

  validateAnswer(submitted: string, question: Question): AnswerResult {
    return validateOpenAnswer(submitted, question)
  }

  onQuestionStart(_context: RoundContext): void {}
  onAnswerSubmitted(
    _answer: { teamId: string; answer: string; serverTimestamp: number },
    _context: RoundContext,
  ): void {}
  onTimerElapsed(_context: RoundContext): void {}
  onReveal(_context: RoundContext): RevealResult {
    return { teamAnswers: [] }
  }

  calculateAudienceScore(activity: AudienceActivity, isCorrect: boolean): number {
    if (!isCorrect) return 0
    if (activity === AudienceActivity.CLUE_DEPTH_PREDICTION) return GAME_CONSTANTS.AUDIENCE_CLUE_DEPTH_POINTS
    return 0
  }
}
