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

export class UltimateChallengeMode implements GameModeStrategy {
  readonly name = 'ultimate_challenge'
  readonly displayName = 'Ultimate Challenge'
  readonly description =
    'Teams answer rapid-fire verbal questions one team at a time. The moderator marks answers correct or skips them. Speed under pressure wins.'
  readonly rules = [
    'One team plays at a time — selected by the moderator',
    'Questions cycle on screen; team shouts their answers verbally',
    'Moderator marks each answer Correct or Skips it',
    'Correct answers are removed; skipped questions loop to the end of the queue',
    'The round ends when time expires or all questions are answered',
    'No penalty for wrong answers — just keep trying until the buzzer',
  ]
  readonly compatibleQuestionTypes: QuestionType[] = [QuestionType.OPEN, QuestionType.TRUEFALSE]
  readonly defaultTimerSeconds = GAME_CONSTANTS.UC_DEFAULT_TIMER_SECONDS
  readonly defaultPointsPerQuestion = GAME_CONSTANTS.UC_DEFAULT_POINTS_PER_CORRECT
  readonly scoringStrategy = ScoringStrategy.FIXED
  readonly answerBehavior = AnswerBehavior.TURN_BASED
  readonly audienceActivities: AudienceActivity[] = [AudienceActivity.EMOJI_REACT]
  readonly stateMachineFlow: GameState[] = [
    GameState.LOBBY,
    GameState.AUDIENCE_VOTE,
    GameState.ROUND_INTRO,
    GameState.UC_TEAM_SELECT,
    GameState.UC_ACTIVE,
    GameState.ROUND_SUMMARY,
    GameState.SESSION_END,
  ]

  calculateScore(params: ScoreParams): number {
    if (!params.isCorrect) return 0
    return params.basePoints
  }

  validateAnswer(submitted: string, question: Question): AnswerResult {
    return validateOpenAnswer(submitted, question)
  }

  onQuestionStart(_context: RoundContext): void {
    // UC: moderator drives question flow via mark-correct / skip events
  }

  onAnswerSubmitted(
    _answer: { teamId: string; answer: string; serverTimestamp: number },
    _context: RoundContext,
  ): void {
    // UC: answers are verbal; moderator judges correctness
  }

  onTimerElapsed(_context: RoundContext): void {
    // UC: gateway ends the active team's turn when team timer fires
  }

  onReveal(_context: RoundContext): RevealResult {
    return { teamAnswers: [] }
  }

  calculateAudienceScore(_activity: AudienceActivity, _isCorrect: boolean): number {
    // UC: No prediction/ghost points yet (verbal-only interaction mostly)
    return 0
  }
}
