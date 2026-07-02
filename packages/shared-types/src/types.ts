import type {
  GameMode,
  QuestionType,
  QuestionDifficulty,
  SessionStatus,
  QuizStatus,
  ScoringStrategy,
  AnswerBehavior,
  AudienceActivity,
  GameState,
  AnswerValidationTier,
  AudienceEngagementLevel,
  AudienceInteractionType,
} from './enums'

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Quiz {
  id: string
  name: string
  description?: string
  date?: string
  status: QuizStatus
  createdAt: string
  updatedAt: string
  deletedAt?: string
  rounds?: Round[]
  teams?: Team[]
}

export interface Team {
  id: string
  quizId: string
  name: string
  color: string
  pin: string
  joinCode?: string
  createdAt: string
  deletedAt?: string
  members?: TeamMember[]
}

export interface TeamMember {
  id: string
  teamId: string
  name: string
  avatarUrl?: string
}

export interface Round {
  id: string
  quizId: string
  order: number
  name?: string
  gameMode: GameMode
  questionCount: number
  timerSeconds: number
  pointsPerQuestion: number
  bonusPointsPerQuestion: number
  status: string
  audienceLevel: AudienceEngagementLevel
  createdAt: string
  deletedAt?: string
  questions?: Question[]
}

export interface Question {
  id: string
  roundId: string
  order: number
  type: QuestionType
  text: string
  mediaUrl?: string
  correctAnswer: string
  aliases: string[]
  clues: string[]       // Clue Reveal: ordered clue strings (empty for other modes)
  fuzzyThreshold: number
  points: number
  difficulty: QuestionDifficulty
  status: string
  createdAt: string
  deletedAt?: string
  options?: MCQOption[]
}

export interface MCQOption {
  id: string
  questionId: string
  label: string
  text: string
  isCorrect: boolean
}

export interface Session {
  id: string
  quizId: string
  status: SessionStatus
  currentRoundId?: string
  currentQuestionId?: string
  sessionCode?: string
  createdAt: string
  endedAt?: string
}

export interface SessionTeam {
  id: string
  sessionId: string
  teamId: string
  score: number
  roundScores: Record<string, number>
  rank?: number
  connected: boolean
  socketId?: string
  team?: Team
}

export interface TeamAnswer {
  id: string
  questionId: string
  teamId: string
  sessionId: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
  timeRemaining: number
  submittedAt: string
}

export interface AudienceMember {
  id: string
  sessionId: string
  nickname: string
  fingerprint: string
  totalPoints: number
  connected: boolean
  socketId?: string
}

export interface AudienceInteraction {
  id: string
  memberId: string
  sessionId: string
  questionId?: string
  type: AudienceInteractionType
  activity: AudienceActivity
  payload: any // { teamId: string }, { range: string }, { answer: string }, etc.
  pointsEarned: number
  isCorrect: boolean
  submittedAt: string
}

// ─── Score & Result Types ──────────────────────────────────────────────────────

export interface TeamScore {
  teamId: string
  teamName: string
  teamColor: string
  score: number
  rank: number
  roundScores: Record<string, number>
  members?: Array<{ id: string; name: string; avatarUrl?: string }>
}

export interface QuestionRevealData {
  questionId: string
  correctAnswer: string
  teamAnswers: TeamAnswerResult[]
  updatedScores: TeamScore[]
  isLastQuestion: boolean
  isSuddenVictory?: boolean
}

export interface TeamAnswerResult {
  teamId: string
  teamName: string
  teamColor: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
  timeRemaining: number
}

export interface RoundSummaryData {
  roundId: string
  roundName?: string
  teamScores: TeamScore[]
  roundPoints: Record<string, number>
  audiencePredictionResults: AudiencePredictionResult[]
  audienceLeaderboard: AudienceLeaderboardEntry[]
  audienceStats?: {
    totalInteractions: number
    correctInteractions: number
    accuracyPercentage: number
  }
}

export interface AudiencePredictionResult {
  memberId: string
  nickname: string
  predictedRanking: string[]
  pointsEarned: number
}

export interface AudienceLeaderboardEntry {
  rank: number
  memberId: string
  nickname: string
  totalPoints: number
}

export interface SessionEndData {
  finalScores: TeamScore[]
  highlights: SessionHighlights
  audienceLeaderboard: AudienceLeaderboardEntry[]
  audienceWinner?: AudienceLeaderboardEntry
  audienceStats?: {
    totalInteractions: number
    correctInteractions: number
    accuracyPercentage: number
  }
}

export interface SessionHighlights {
  fastestAnswer?: { teamName: string; timeRemaining: number; questionText: string }
  perfectRound?: { teamName: string; roundName?: string }
  biggestComeback?: { teamName: string; pointsGained: number; roundName?: string }
  audienceAccuracyKing?: { nickname: string; accuracy: number }
}

// ─── Scoring Types ─────────────────────────────────────────────────────────────

export interface ScoreParams {
  basePoints: number
  timeRemainingMs: number
  timerDurationMs: number
  isCorrect: boolean
}

export interface AnswerResult {
  correct: boolean
  tier?: AnswerValidationTier
  similarity?: number
}

// ─── Game Engine Context Types ──────────────────────────────────────────────────

export interface RoundContext {
  sessionId: string
  roundId: string
  currentQuestionId?: string
  submittedTeams: Set<string>
  sessionTeams: SessionTeam[]
  questions: Question[]
  currentQuestionIndex: number
  timerDeadline?: number
}

export interface NetworkInfo {
  localIP: string
  port: number
  joinURL: string
}

// ─── Re-export enums ────────────────────────────────────────────────────────────

export type {
  GameMode,
  QuestionType,
  QuestionDifficulty,
  SessionStatus,
  QuizStatus,
  ScoringStrategy,
  AnswerBehavior,
  AudienceActivity,
  GameState,
  AnswerValidationTier,
  AudienceEngagementLevel,
  AudienceInteractionType,
}
