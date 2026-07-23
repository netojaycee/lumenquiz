import type { SessionStatus, Question, AudienceEngagementLevel, AudienceInteractionType, AudienceActivity } from '@apoquiz/shared-types'

export interface CachedRound {
  id: string
  name: string | null
  order: number
  gameMode: string
  questionCount: number
  timerSeconds: number
  pointsPerQuestion: number
  bonusPointsPerQuestion: number
  audienceLevel: AudienceEngagementLevel
}

export interface TileState {
  questionId: string
  tileIndex: number
  used: boolean
  activeTeamId: string | null
}

export interface UCTurnReview {
  teamId: string
  teamName: string
  teamColor: string
  questions: Array<{
    questionId: string
    questionText: string
    correctAnswer: string
    wasAnswered: boolean
    pointsEarned: number
  }>
  totalCorrect: number
  totalPoints: number
  completedAt: number
}

export interface UltimateChallengeState {
  // Moderator-selected active team (null when waiting for selection)
  activeTeamId: string | null

  // Number of questions each team was assigned
  questionsPerTeam: number

  // 🧠 Per-team circular queues (questionIds)
  // queue[0] is always the current question
  teamQueues: Map<string, Question[]>

  // 📊 Initial queue sizes (for UI progress tracking)
  initialQueueSizes: Map<string, number>

  // ✅ Teams that have completed their turn
  teamsCompleted: Set<string>

  // ⏱ Timer for the currently active team
  timerDeadline: number
  timerHandle: ReturnType<typeof setTimeout> | null

  // 📝 Review tracking — populated each turn
  originalQueues: Map<string, Question[]>   // snapshot of queue at turn start
  turnCorrectIds: Map<string, string[]>     // questionIds answered correctly per team
  turnReviews: Map<string, UCTurnReview>    // completed turn reviews per team
}

export interface TileBlitzState {
  turnOrderTeamIds: string[]
  currentTurnIndex: number
  tileStates: TileState[]
  bonusPointsPerQuestion: number
  // Pending answer from active team (not yet scored — updated on each selection change)
  pendingAnswer: string | null
  // Bonus tracking
  bonusBuzzTeamId: string | null
  bonusGranted: boolean
  // Bonus timer — half of the round's question timer, starts on grant
  bonusTimerStartTime: number | null
  bonusTimerDurationMs: number | null
  bonusTimerHandle: ReturnType<typeof setTimeout> | null
  // Number of turns taken (for detecting round completion)
  turnsCompleted: number
  totalTurns: number
}

export interface ClueRevealState {
  // All clues for the current question (pre-loaded from cache)
  clues: string[]
  // 0-based index of the currently visible clue
  currentClueIndex: number
  // Points available for correct answer at this clue index
  pointsAvailable: number
  // Teams locked out after a wrong buzz for this question
  lockedTeamIds: Set<string>
  // Team currently in the CLUE_ANSWERING state (null = nobody buzzing)
  buzzingTeamId: string | null
  // Countdown for current clue (fires CLUE_TIMER_ELAPSED but doesn't auto-advance)
  clueTimerHandle: ReturnType<typeof setTimeout> | null
  clueTimerDeadline: number
  // Answering timer — starts when a team buzzes (half of clue timer)
  answeringTimerHandle: ReturnType<typeof setTimeout> | null
  answeringTimerDeadline: number
}

export interface AudienceInteractionState {
  type: AudienceInteractionType
  activity: AudienceActivity
  questionId?: string
  deadline: number
  handle: ReturnType<typeof setTimeout> | null
  tally: Record<string, number>
  totalSubmissions: number
  submissions: Map<string, any> // memberId -> payload
}

export interface CachedTeamScore {
  sessionTeamId: string
  teamId: string
  teamName: string
  teamColor: string
  score: number
  roundScores: Record<string, number>
  // Tiebreaker: sum of timeRemaining (ms) on all correct answers — higher = answered faster overall
  correctAnswerTimeMs: number
  members: Array<{ id: string; name: string; avatarUrl?: string }>
}

export interface SessionCache {
  sessionId: string
  sessionCode: string
  quizId: string
  status: SessionStatus
  audienceCount: number

  // Round state
  rounds: CachedRound[]
  currentRoundIndex: number
  currentRoundId: string | null

  // Question state — pre-loaded when round starts (never queried mid-reveal)
  currentRoundQuestions: Question[]
  currentQuestionIndex: number

  // Per-question answer tracking
  submittedTeams: Set<string> // teamIds that have submitted this question
  submittedAnswers: Map<string, CachedSubmittedAnswer> // teamId → buffered answer for current question

  // Score sort cache — invalidated whenever any team score changes
  scoresDirty: boolean
  cachedScoresResult: import('@apoquiz/shared-types').TeamScore[] | null
  questionStartTime: number // server epoch ms when question was opened
  timerDeadline: number // epoch ms when timer expires
  timerDurationMs: number
  questionTimerHandle: ReturnType<typeof setTimeout> | null

  // Pause/resume support
  pausedAt: number | null // epoch ms when paused (null = not paused)
  remainingMsAtPause: number | null

  // Live scores — updated in memory on each answer, flushed to DB async
  teamScores: Map<string, CachedTeamScore>

  // Team online presence — updated on join/disconnect, included in session:state snapshot
  connectedTeamIds: Set<string>

  // Round completion tracking — prevents restarting a finished round
  completedRoundIds: Set<string>

  // Audience activity
  audienceVoteTally: Record<string, number> // teamId → vote count (ranked #1)
  audienceVotePositionTally: Record<string, Record<number, number>> // teamId → {position → count}
  audienceEmojiCount: Record<string, number> // emoji → total count

  audienceLevel: AudienceEngagementLevel
  activeInteraction: AudienceInteractionState | null

  // Tile Blitz specific state (only populated when gameMode === 'tile_blitz')
  tileBlitz?: TileBlitzState

  // Ultimate Challenge specific state (only populated when gameMode === 'ultimate_challenge')
  ultimateChallenge?: UltimateChallengeState

  // Clue Reveal specific state (only populated when gameMode === 'clue_reveal')
  clueReveal?: ClueRevealState

  // Sudden Victory tiebreaker state
  suddenVictory?: SuddenVictoryState
}

export interface CachedSubmittedAnswer {
  teamId: string
  teamName: string
  teamColor: string
  questionId: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
  timeRemaining: number
}

export interface SuddenVictoryState {
  tiedTeamIds: string[]
  question: import('@apoquiz/shared-types').Question
  timerHandle: ReturnType<typeof setTimeout> | null
}

// Module-scoped singleton — all gateway methods share this Map
export const activeSessions = new Map<string, SessionCache>()
