'use client'
import { create } from 'zustand'
import { SessionStatus, type Question, AudienceInteractionType, AudienceActivity } from '@apoquiz/shared-types'
import type {
  QuestionOpenPayload,
  QuestionRevealPayload,
  RoundSummaryPayload,
  RoundVoteOpenPayload,
  RoundVoteUpdatePayload,
  SessionEndPayload,
  SessionStatePayload,
  TimerData,
} from '@apoquiz/socket-events'

interface AudienceStore {
  audienceId: string | null
  sessionId: string | null
  fullName: string | null
  fingerprint: string | null
  totalPoints: number
  rank: number | null
  audienceCount: number

  sessionStatus: SessionStatus | null
  voteData: RoundVoteOpenPayload | null
  voteTally: Record<string, number>
  hasVoted: boolean
  votedRoundIds: string[]
  currentQuestion: Question | null
  timerData: TimerData | null
  hasPredicted: boolean
  predictionTeamId: string | null
  revealData: QuestionRevealPayload | null
  roundSummary: RoundSummaryPayload | null
  sessionEndData: SessionEndPayload | null
  activeInteraction: {
    type: AudienceInteractionType
    activity: AudienceActivity
    questionId?: string
    durationMs: number
    deadline: number
    prompt: string
    options?: any[]
  } | null
  hasSubmittedInteraction: boolean

  setIdentity: (data: { audienceId: string; sessionId: string; fullName: string; fingerprint: string }) => void
  applySessionState: (data: SessionStatePayload) => void
  setRoundStart: () => void
  setCurrentQuestion: (data: QuestionOpenPayload) => void
  setVoteOpen: (data: RoundVoteOpenPayload) => void
  setVoteClosed: () => void
  updateVote: (data: RoundVoteUpdatePayload) => void
  setPoints: (totalPoints: number) => void
  lockVote: (roundId: string, ranking: string[]) => void
  lockPrediction: (teamId: string) => void
  setReveal: (data: QuestionRevealPayload) => void
  setRoundSummary: (data: RoundSummaryPayload) => void
  setSessionEnd: (data: SessionEndPayload) => void
  setAudienceInteractionStart: (data: any) => void
  closeAudienceInteraction: () => void
  submitInteraction: (payload?: { predictedTeamId?: string; predictedValue?: number }) => void
  updatePoints: (data: { pointsEarned: number; totalPoints: number }) => void
  reset: () => void
}

export const useAudienceStore = create<AudienceStore>((set) => ({
  audienceId: null,
  sessionId: null,
  fullName: null,
  fingerprint: null,
  totalPoints: 0,
  rank: null,
  audienceCount: 0,
  sessionStatus: null,
  voteData: null,
  voteTally: {},
  hasVoted: false,
  votedRoundIds: [],
  currentQuestion: null,
  timerData: null,
  hasPredicted: false,
  predictionTeamId: null,
  revealData: null,
  roundSummary: null,
  sessionEndData: null,
  activeInteraction: null,
  hasSubmittedInteraction: false,

  setIdentity: ({ audienceId, sessionId, fullName, fingerprint }) =>
    set({ audienceId, sessionId, fullName, fingerprint }),

  applySessionState: (data) => set({
    sessionStatus: data.status,
    audienceCount: data.audienceCount,
    activeInteraction: (data as any).activeInteraction ?? null,
  }),

  setRoundStart: () => set({ sessionStatus: SessionStatus.ROUND_INTRO }),

  setCurrentQuestion: (data) => set({
    sessionStatus: SessionStatus.QUESTION_OPEN,
    currentQuestion: data.question,
    timerData: { startTime: data.startTime, durationMs: data.durationMs },
    hasPredicted: false,
    predictionTeamId: null,
    revealData: null,
  }),

  setVoteOpen: (data) => set((s) => ({
    sessionStatus: SessionStatus.AUDIENCE_VOTE,
    voteData: data,
    voteTally: {},
    // If already voted in this round, keep hasVoted true so UI shows confirmation
    hasVoted: s.votedRoundIds.includes(data.roundId),
  })),

  setVoteClosed: () => set({ sessionStatus: SessionStatus.LOBBY, voteData: null }),

  updateVote: (data) => set({ voteTally: data.tally }),

  setPoints: (totalPoints) => set({ totalPoints }),

  lockVote: (roundId, _ranking) => set((s) => ({
    hasVoted: true,
    votedRoundIds: s.votedRoundIds.includes(roundId) ? s.votedRoundIds : [...s.votedRoundIds, roundId],
  })),

  lockPrediction: (teamId) => set({ hasPredicted: true, predictionTeamId: teamId }),

  setReveal: (data) => set({ sessionStatus: SessionStatus.ANSWER_REVEAL, revealData: data }),

  setRoundSummary: (data) => set({ sessionStatus: SessionStatus.ROUND_SUMMARY, roundSummary: data }),

  setSessionEnd: (data) => set({ sessionStatus: SessionStatus.SESSION_END, sessionEndData: data }),

  setAudienceInteractionStart: (data) => set({
    activeInteraction: {
      ...data,
      deadline: Date.now() + data.durationMs,
    },
    hasSubmittedInteraction: false,
  }),

  closeAudienceInteraction: () => set({ activeInteraction: null }),

  submitInteraction: (payload) => set((s) => ({
    hasSubmittedInteraction: true,
    hasPredicted: s.activeInteraction?.type === AudienceInteractionType.PREDICTION ? true : s.hasPredicted,
    predictionTeamId: s.activeInteraction?.type === AudienceInteractionType.PREDICTION ? (payload?.predictedTeamId ?? s.predictionTeamId) : s.predictionTeamId,
  })),

  updatePoints: (data) => set({
    totalPoints: data.totalPoints
  }),

  reset: () => set({
    sessionStatus: null, voteData: null, voteTally: {}, hasVoted: false,
    currentQuestion: null, timerData: null, hasPredicted: false,
    predictionTeamId: null, revealData: null, roundSummary: null, sessionEndData: null,
  }),
}))
