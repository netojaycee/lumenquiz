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

export class TileBlitzMode implements GameModeStrategy {
  readonly name = 'tile_blitz'
  readonly displayName = 'Tile Blitz'
  readonly description =
    'Teams take turns selecting questions from a tile grid. A wrong answer opens a bonus round for rivals to buzz in.'
  readonly rules = [
    'Teams play in rotating order — one team at a time',
    'The moderator selects a tile from the grid for the active team',
    'Active team can change their MCQ selection freely until time runs out',
    'Wrong answer? The moderator can open a bonus — first team to buzz wins the chance',
    'Selected tiles are locked — each question can only be played once',
  ]
  readonly compatibleQuestionTypes: QuestionType[] = [QuestionType.MCQ]
  readonly defaultTimerSeconds = GAME_CONSTANTS.TILE_BLITZ_DEFAULT_TIMER_SECONDS
  readonly defaultPointsPerQuestion = GAME_CONSTANTS.TILE_BLITZ_DEFAULT_POINTS
  readonly scoringStrategy = ScoringStrategy.FIXED
  readonly answerBehavior = AnswerBehavior.TURN_BASED
  readonly audienceActivities: AudienceActivity[] = [
    AudienceActivity.EMOJI_REACT,
  ]
  readonly stateMachineFlow: GameState[] = [
    GameState.LOBBY,
    GameState.AUDIENCE_VOTE,
    GameState.ROUND_INTRO,
    GameState.TILE_SELECT,
    GameState.QUESTION_OPEN,
    GameState.QUESTION_LOCKED,
    GameState.ANSWER_REVEAL,
    GameState.BONUS_OPEN,
    GameState.BONUS_ANSWERING,
    GameState.BONUS_REVEAL,
    GameState.ROUND_SUMMARY,
    GameState.SESSION_END,
  ]

  // Fixed scoring — no time decay for Tile Blitz
  calculateScore(params: ScoreParams): number {
    if (!params.isCorrect) return 0
    return params.basePoints
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
    // Tile Blitz: moderator selects the tile; gateway handles open
  }

  onAnswerSubmitted(
    _answer: { teamId: string; answer: string; serverTimestamp: number },
    _context: RoundContext,
  ): void {
    // Tile Blitz: answers are provisional until lock; gateway stores pending answer
  }

  onTimerElapsed(_context: RoundContext): void {
    // Tile Blitz: gateway locks using pending answer from cache
  }

  onReveal(_context: RoundContext): RevealResult {
    return { teamAnswers: [] }
  }

  calculateAudienceScore(activity: AudienceActivity, isCorrect: boolean): number {
    if (!isCorrect) return 0
    if (activity === AudienceActivity.GHOST_ANSWER) return GAME_CONSTANTS.AUDIENCE_GHOST_ANSWER_POINTS
    return 0
  }
}
