import type {
  SessionStatus,
  Question,
  QuestionRevealData,
  RoundSummaryData,
  SessionEndData,
  TeamScore,
  Round,
  UserRole,
  AudienceEngagementLevel,
  AudienceInteractionType,
  AudienceActivity,
} from '@apoquiz/shared-types'

// ─── Connection Payloads ───────────────────────────────────────────────────────

export interface RejoinPayload {
  role: UserRole
  sessionId?: string
  teamCode?: string // single join credential for team role (replaces sessionId + pin)
  deviceToken?: string // device-binding token received on first team join; sent on every rejoin
  teamId?: string
  pin?: string
  audienceId?: string
  nickname?: string
  fingerprint?: string
}

// ─── Session State Snapshot ────────────────────────────────────────────────────

export interface SessionStatePayload {
  sessionId: string
  status: SessionStatus
  currentRound?: Round
  currentQuestionIndex?: number
  totalQuestions?: number
  scores: TeamScore[]
  audienceCount: number
  timerData?: TimerData
  connectedTeamIds?: string[]
}

export interface TimerData {
  startTime: number
  durationMs: number
}

// ─── Server → Client Payloads ─────────────────────────────────────────────────

export interface QuestionOpenPayload {
  questionId: string
  question: Question
  startTime: number
  durationMs: number
  questionIndex: number
  totalQuestions: number
  isSuddenVictory?: boolean
  suddenVictoryTeamIds?: string[]
}

export interface RoundVoteOpenPayload {
  roundId: string
  roundName?: string
  teams: Array<{ id: string; name: string; color: string }>
  durationMs: number
}

export interface RoundVoteUpdatePayload {
  tally: Record<string, number>
  positionTally?: Record<string, Record<string, number>> // teamId → {position → count}
  totalVotes: number
}

export interface RoundStartPayload {
  round: Round
  scores: TeamScore[]
}

export interface QuestionRevealPayload extends QuestionRevealData {}

export interface ScoresUpdatePayload {
  scores: TeamScore[]
}

export interface RoundSummaryPayload extends RoundSummaryData {}

export interface SessionEndPayload extends SessionEndData {}

export interface EmojiReactPayload {
  emoji: string
  audienceId: string
  count: Record<string, number>
}

export interface AudiencePointsUpdatePayload {
  pointsEarned: number
  totalPoints: number
}

export interface ErrorPayload {
  code: string
  message: string
}

// ─── Client → Server: Moderator Payloads ──────────────────────────────────────

export interface ModeratorVoteOpenPayload {
  sessionId: string
  roundId: string
  durationMs?: number
}

export interface ModeratorVoteClosePayload {
  sessionId: string
  roundId: string
}

export interface ModeratorRoundStartPayload {
  sessionId: string
  roundId: string
}

export interface ModeratorQuestionRevealPayload {
  sessionId: string
  questionId: string
}

export interface ModeratorAnswerRevealPayload {
  sessionId: string
  questionId: string
}

export interface ModeratorScoreOverridePayload {
  sessionId: string
  teamId: string
  adjustment: number
  reason: string
}

export interface ModeratorTimerPausePayload {
  sessionId: string
  paused: boolean
}

// ─── Client → Server: Team Payloads ───────────────────────────────────────────

export interface TeamAnswerSubmitPayload {
  teamId: string
  questionId: string
  sessionId: string
  answer: string
  clientTimestamp: number
}

// ─── Client → Server: Audience Payloads ───────────────────────────────────────

export interface AudienceVoteSubmitPayload {
  audienceId: string
  sessionId: string
  roundId: string
  predictedRanking: string[]
}

export interface AudiencePredictSubmitPayload {
  audienceId: string
  sessionId: string
  questionId: string
  predictedTeamId: string
}

export interface AudienceReactPayload {
  audienceId: string
  sessionId: string
  emoji: string
}

export interface AudienceTrueFalseSubmitPayload {
  audienceId: string
  sessionId: string
  questionId: string
  answer: boolean
}

// ─── Tile Blitz Payloads ──────────────────────────────────────────────────────

export interface TileState {
  questionId: string
  tileIndex: number
  used: boolean
  activeTeamId: string | null // which team played this tile
}

export interface TileBlitzStatePayload {
  tiles: TileState[]
  turnOrderTeamIds: string[]
  currentTurnIndex: number
  activeTeamId: string
  turnNumber: number
  totalTurns: number
}

export interface TileBlitzSelectTilePayload {
  sessionId: string
  questionId: string
}

export interface TileBlitzLockPayload {
  sessionId: string
}

export interface TileBlitzBonusOpenPayload {
  sessionId: string
}

export interface TileBlitzBonusBuzzPayload {
  teamId: string
  sessionId: string
}

export interface TileBlitzBonusGrantPayload {
  sessionId: string
}

export interface TileBlitzBonusRevealPayload {
  sessionId: string
}

export interface TileBlitzNextTurnPayload {
  sessionId: string
}

export interface TileBlitzBonusClaimedPayload {
  teamId: string
  teamName: string
  teamColor: string
}

export interface TileBlitzBonusGrantedPayload {
  bonusTeamId: string
  questionId: string | undefined
  bonusTimerStartTime: number
  bonusTimerDurationMs: number
}

export interface TileBlitzBonusResultPayload {
  teamId: string
  teamName: string
  teamColor: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
  correctAnswer: string
  scores: TeamScore[]
}

export interface TileBlitzPendingAnswerPayload {
  teamId: string
  teamName: string
  teamColor: string
  answer: string
  isBonus: boolean
}

export interface QuestionOpenTileBlitzPayload extends QuestionOpenPayload {
  activeTeamId: string
  isTileBlitz: true
}

export interface CumulativeScoresPayload {
  finalScores: TeamScore[]
  audienceLeaderboard: import('@apoquiz/shared-types').AudienceLeaderboardEntry[]
  isLastRound: boolean
}

// ─── Ultimate Challenge Payloads ──────────────────────────────────────────────

export interface UCTeamInfo {
  teamId: string
  teamName: string
  teamColor: string
}

export interface UCCurrentQuestion {
  id: string
  text: string
  correctAnswer: string // shown to moderator only; projector ignores this field
  aliases: string[]
}

// export interface UCStatePayload {
//   activeTeamId: string | null
//   activeTeamName: string | null
//   activeTeamColor: string | null
//   currentQuestion: UCCurrentQuestion | null
//   queueLength: number
//   correctCount: number
//   timerDeadline: number
//   teamsDone: Array<UCTeamInfo & { correctCount: number; score: number }>
//   teamsRemaining: UCTeamInfo[]
//   scores: TeamScore[]
// }

export interface UCStatePayload {
  // 🎯 Active team in control (null in UC_TEAM_SELECT)
  activeTeamId: string | null
  activeTeamName: string | null
  activeTeamColor: string | null

  // 🧠 Current question is derived from active team's queue[0]
  currentQuestion: UCCurrentQuestion | null

  // ⏱ Timer
  timerDeadline: number

  // 📊 Per-team live state (NEW MODEL)
  teams: Array<{
    teamId: string
    teamName: string
    teamColor: string

    // queue-based progress (CRITICAL)
    remaining: number
    total: number
    progress: number // 0 → 1

    // game state
    isActive: boolean
    isCompleted: boolean

    score: number
  }>

  // 🏁 Completed teams summary
  teamsDone: Array<{
    teamId: string
    teamName: string
    teamColor: string
    score: number
    remaining: number
  }>

  // 🏆 Scoreboard (can replace teamsDone if redundant later)
  scores: TeamScore[]

  status: SessionStatus

  lastAction?: string
}

export interface UCQuestionUpdatePayload {
  type: 'correct' | 'skip'
  questionId: string
  correctCount: number
  pointsAwarded: number
  nextQuestion: UCCurrentQuestion | null
  queueLength: number
  scores: TeamScore[]
}

export interface UCTeamDonePayload {
  teamId: string
  teamName: string
  teamColor: string
  correctCount: number
  pointsEarned: number
  isLastTeam: boolean
}

export interface UCSelectTeamPayload {
  sessionId: string
  teamId: string
}

export interface UCMarkCorrectPayload {
  sessionId: string
}

export interface UCSkipPayload {
  sessionId: string
}

export interface UCEndTurnPayload {
  sessionId: string
}

export interface UCTurnReviewQuestion {
  questionId: string
  questionText: string
  correctAnswer: string
  wasAnswered: boolean
  pointsEarned: number
}

export interface UCTurnReviewPayload {
  teamId: string
  teamName: string
  teamColor: string
  questions: UCTurnReviewQuestion[]
  totalCorrect: number
  totalPoints: number
  completedAt: number
}

export interface UCEmitReviewPayload {
  sessionId: string
  teamId: string
}

export interface UCOverrideAnswerPayload {
  sessionId: string
  teamId: string
  questionId: string
}

export interface UCRemoveOverridePayload {
  sessionId: string
  teamId: string
  questionId: string
}

export interface UCTeamSkipPayload {
  sessionId: string
  teamId: string
}

export interface UCEmitAudioPayload {
  sessionId: string
  teamId: string
}

export interface UCAudioPlayPayload {
  teamId: string
  teamName: string
  teamColor: string
  // Screen client constructs the full URL from its own API base + sessionId
}

// ─── Clue Reveal Payloads ──────────────────────────────────────────────────────

export interface ClueStatePayload {
  questionId: string
  correctAnswer: string | null
  clues: string[]
  currentClueIndex: number // 0-based — how many clues shown so far
  currentClueText: string // the clue currently visible
  pointsAvailable: number
  lockedTeamIds: string[]
  buzzingTeamId: string | null
  buzzingTeamName: string | null
  buzzingTeamColor: string | null
  timerDeadline: number
  questionIndex: number
  totalQuestions: number
  scores: TeamScore[]
  answeringTimerDeadline: number
}

export interface ClueNextPayload {
  clueIndex: number // 0-based index of newly revealed clue
  clueText: string
  pointsAvailable: number
  timerDeadline: number
}

export interface ClueAnswerResultPayload {
  teamId: string
  teamName: string
  teamColor: string
  isCorrect: boolean
  submittedAnswer: string
  pointsEarned: number
  clueIndex: number
}

export interface ClueBuzzPayload {
  teamId: string
  sessionId: string
}

export interface ModeratorClueRevealNextPayload {
  sessionId: string
}

export interface ModeratorClueSkipPayload {
  sessionId: string
}

// ─── Audience Engagement Payloads ──────────────────────────────────────────────

export interface AudienceInteractionStartPayload {
  activity: AudienceActivity
  type: AudienceInteractionType
  questionId?: string
  durationMs: number
  prompt: string
  options?: any[] // for predictions/MCQ ghost answers
}

export interface AudienceInteractionUpdatePayload {
  tally: any // e.g. { "teamA": 12, "teamB": 5 } or % correct
  totalSubmissions: number
}

export interface AudienceInteractionClosePayload {
  activity: AudienceActivity
  results: any
}

export interface ModeratorSetAudienceLevelPayload {
  sessionId: string
  level: AudienceEngagementLevel
}

export interface ModeratorTriggerAudienceActivityPayload {
  sessionId: string
  activity: AudienceActivity
}

export interface AudienceGhostAnswerSubmitPayload {
  audienceId: string
  sessionId: string
  questionId: string
  answer: string
}

// ─── Sudden Victory Payloads ──────────────────────────────────────────────────

export interface SVTeamMeta {
  teamId: string
  teamName: string
  teamColor: string
  score: number
}

export interface TieDetectedPayload {
  tiedTeams: SVTeamMeta[]
  topScore: number
  hasEligibleQuestion: boolean
}

export interface SuddenVictoryIntroPayload {
  tiedTeams: SVTeamMeta[]
  questionCount: number
}

export interface SVReadyDeclarePayload {
  sessionId: string
  tiedTeams: SVTeamMeta[]
}
