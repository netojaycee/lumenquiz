'use client'
import { create } from 'zustand'
import { SessionStatus, type Question, type TeamScore, type Round, AudienceEngagementLevel, AudienceActivity, AudienceInteractionType } from '@apoquiz/shared-types'
import type {
  QuestionOpenPayload,
  QuestionRevealPayload,
  RoundStartPayload,
  RoundSummaryPayload,
  RoundVoteOpenPayload,
  RoundVoteUpdatePayload,
  SessionEndPayload,
  SessionStatePayload,
  EmojiReactPayload,
  TimerData,
  TileState,
  TileBlitzBonusClaimedPayload,
  TileBlitzBonusResultPayload,
  CumulativeScoresPayload,
  UCStatePayload,
  UCQuestionUpdatePayload,
  UCTeamDonePayload,
  ClueStatePayload,
  ClueNextPayload,
  ClueAnswerResultPayload,
} from '@apoquiz/socket-events'

export interface TileBlitzScreenState {
  tiles: TileState[]
  turnOrderTeamIds: string[]
  currentTurnIndex: number
  activeTeamId: string
  turnsCompleted: number
  totalTurns: number
  bonusBuzzTeamId: string | null
  bonusGranted: boolean
  activeQuestionTeamId: string | null  // team who is answering in current QUESTION_OPEN
  bonusClaimData: TileBlitzBonusClaimedPayload | null
  bonusResult: TileBlitzBonusResultPayload | null
  bonusTimerStartTime: number | null
  bonusTimerDurationMs: number | null
}

interface ScreenStore {
  sessionId: string | null
  sessionCode: string | null
  sessionStatus: SessionStatus | null
  currentRound: Round | null
  roundRules: { roundName?: string; rules: string[] } | null
  currentQuestion: Question | null
  questionIndex: number
  totalQuestions: number
  timerData: TimerData | null
  scores: TeamScore[]
  connectedTeamIds: string[]
  completedRoundIds: string[]
  submittedTeamIds: string[]
  allAnswered: boolean
  timerElapsed: boolean
  voteData: RoundVoteOpenPayload | null
  voteTally: Record<string, number>
  positionTally: Record<string, Record<string, number>>
  totalVotes: number
  voteClosed: boolean
  revealData: QuestionRevealPayload | null
  roundSummary: RoundSummaryPayload | null
  sessionEndData: SessionEndPayload | null
  emojiCounts: Record<string, number>
  audienceCount: number
  tileBlitz: TileBlitzScreenState | null
  cumulativeData: CumulativeScoresPayload | null
  isLastRound: boolean
  currentRoundId: string | null
  ucState: UCStatePayload | null
  clueState: ClueStatePayload | null
  audienceLevel: AudienceEngagementLevel | null
  qrOverlay: { dataURL: string; url: string; ip: string } | null
  rulesOverlay: { roundName?: string | null; rules: string[] } | null
  activeInteraction: {
    type: AudienceInteractionType
    activity: AudienceActivity
    questionId?: string
    durationMs: number
    deadline: number
    prompt: string
    options?: any[]
    totalSubmissions: number
    tally?: Record<string, number>
  } | null

  setSessionId: (id: string) => void
  applySessionState: (data: SessionStatePayload) => void
  setRoundStart: (data: RoundStartPayload) => void
  setRulesCard: (data: { round: { name?: string | null }; rules: string[] }) => void
  setCurrentQuestion: (data: QuestionOpenPayload & { activeTeamId?: string; isTileBlitz?: boolean }) => void
  addSubmittedTeam: (teamId: string) => void
  setAllAnswered: () => void
  setTimerElapsed: () => void
  setVoteOpen: (data: RoundVoteOpenPayload) => void
  updateVote: (data: RoundVoteUpdatePayload) => void
  setVoteClosed: () => void
  setReveal: (data: QuestionRevealPayload) => void
  setScores: (scores: TeamScore[]) => void
  setRoundSummary: (data: RoundSummaryPayload) => void
  setSessionEnd: (data: SessionEndPayload) => void
  addEmojiReaction: (data: EmojiReactPayload) => void
  setTeamConnected: (teamId: string) => void
  setTeamDisconnected: (teamId: string) => void
  setAudienceCount: (count: number) => void
  setTileBlitzState: (data: Partial<TileBlitzScreenState>) => void
  setTileBlitzBonusClaimed: (data: TileBlitzBonusClaimedPayload) => void
  setTileBlitzBonusResult: (data: TileBlitzBonusResultPayload) => void
  setTileBlitzBonusTimer: (data: { startTime: number; durationMs: number }) => void
  setCumulative: (data: CumulativeScoresPayload) => void
  setUCState: (data: UCStatePayload) => void
  applyUCQuestionUpdate: (data: UCQuestionUpdatePayload) => void
  applyUCTeamDone: (data: UCTeamDonePayload) => void
  setClueState: (data: ClueStatePayload) => void
  applyClueNext: (data: ClueNextPayload) => void
  applyClueAnswerResult: (data: ClueAnswerResultPayload) => void
  setAudienceLevel: (level: AudienceEngagementLevel) => void
  setAudienceInteractionStart: (data: any) => void
  updateAudienceInteraction: (data: any) => void
  closeAudienceInteraction: () => void
  showQROverlay: (data: { dataURL: string; url: string; ip: string }) => void
  hideQROverlay: () => void
  showRulesOverlay: (data: { roundName?: string | null; rules: string[] }) => void
  hideRulesOverlay: () => void
  reset: () => void
}

export const useScreenStore = create<ScreenStore>((set) => ({
  sessionId: null,
  sessionCode: null,
  sessionStatus: null,
  currentRound: null,
  roundRules: null,
  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  timerData: null,
  scores: [],
  connectedTeamIds: [],
  completedRoundIds: [],
  submittedTeamIds: [],
  allAnswered: false,
  timerElapsed: false,
  voteData: null,
  voteTally: {},
  positionTally: {},
  totalVotes: 0,
  voteClosed: false,
  revealData: null,
  roundSummary: null,
  sessionEndData: null,
  emojiCounts: {},
  audienceCount: 0,
  tileBlitz: null,
  cumulativeData: null,
  isLastRound: false,
  currentRoundId: null,
  ucState: null,
  clueState: null,
  audienceLevel: null,
  qrOverlay: null,
  rulesOverlay: null,
  activeInteraction: null,

  setSessionId: (id) => set({ sessionId: id }),

  applySessionState: (data) => set((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bonusTimerData = (data as any).bonusTimerData as { startTime: number; durationMs: number } | undefined
    return {
      sessionStatus: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessionCode: (data as any).sessionCode ?? s.sessionCode,
      scores: data.scores,
      audienceCount: data.audienceCount,
      timerData: data.timerData ?? null,
      questionIndex: data.currentQuestionIndex ?? 0,
      totalQuestions: data.totalQuestions ?? 0,
      connectedTeamIds: data.connectedTeamIds ?? s.connectedTeamIds,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      completedRoundIds: (data as any).completedRoundIds ?? s.completedRoundIds,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isLastRound: (data as any).isLastRound ?? s.isLastRound,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentRoundId: (data as any).currentRoundId ?? s.currentRoundId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ucState: (data as any).ucState ?? s.ucState,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clueState: (data as any).clueState ?? s.clueState,
      audienceLevel: (data as any).audienceLevel ?? s.audienceLevel,
      activeInteraction: (data as any).activeInteraction ?? s.activeInteraction,
      tileBlitz: bonusTimerData && s.tileBlitz
        ? { ...s.tileBlitz, bonusTimerStartTime: bonusTimerData.startTime, bonusTimerDurationMs: bonusTimerData.durationMs }
        : s.tileBlitz,
    }
  }),

  setRoundStart: (data) => set({
    sessionStatus: SessionStatus.ROUND_INTRO,
    currentRound: data.round,
    scores: data.scores,
    roundRules: null,
    cumulativeData: null,
  }),

  setRulesCard: (data) => set({
    roundRules: { roundName: data.round.name ?? undefined, rules: data.rules },
  }),

  setCurrentQuestion: (data) => set((s) => ({
    sessionStatus: SessionStatus.QUESTION_OPEN,
    currentQuestion: data.question,
    questionIndex: data.questionIndex,
    totalQuestions: data.totalQuestions,
    timerData: { startTime: data.startTime, durationMs: data.durationMs },
    submittedTeamIds: [],
    allAnswered: false,
    timerElapsed: false,
    revealData: null,
    // Record active team for Tile Blitz
    tileBlitz: data.isTileBlitz && data.activeTeamId
      ? { ...(s.tileBlitz ?? {} as TileBlitzScreenState), activeQuestionTeamId: data.activeTeamId, bonusClaimData: null, bonusResult: null, bonusTimerStartTime: null, bonusTimerDurationMs: null }
      : s.tileBlitz,
  })),

  addSubmittedTeam: (teamId) => set((s) => ({
    submittedTeamIds: [...s.submittedTeamIds, teamId],
  })),

  setAllAnswered: () => set({ sessionStatus: SessionStatus.QUESTION_LOCKED, allAnswered: true }),
  setTimerElapsed: () => set({ sessionStatus: SessionStatus.QUESTION_LOCKED, timerElapsed: true }),

  setVoteOpen: (data) => set({
    sessionStatus: SessionStatus.AUDIENCE_VOTE,
    voteData: data,
    voteTally: {},
    positionTally: {},
    totalVotes: 0,
    voteClosed: false,
  }),

  updateVote: (data) => set({
    voteTally: data.tally,
    positionTally: data.positionTally ?? {},
    totalVotes: data.totalVotes,
  }),

  setVoteClosed: () => set({ sessionStatus: SessionStatus.LOBBY, voteClosed: true }),

  setReveal: (data) => set({ sessionStatus: SessionStatus.ANSWER_REVEAL, revealData: data }),

  setScores: (scores) => set({ scores }),

  setRoundSummary: (data) => set({ 
    sessionStatus: SessionStatus.ROUND_SUMMARY, 
    roundSummary: data,
    isLastRound: (data as any).isLastRound ?? false
  }),

  setSessionEnd: (data) => set({ sessionStatus: SessionStatus.SESSION_END, sessionEndData: data }),

  addEmojiReaction: (data) => set((s) => ({
    emojiCounts: { ...s.emojiCounts, ...data.count },
  })),

  setTeamConnected: (teamId) => set((s) => ({
    connectedTeamIds: s.connectedTeamIds.includes(teamId)
      ? s.connectedTeamIds
      : [...s.connectedTeamIds, teamId],
  })),

  setTeamDisconnected: (teamId) => set((s) => ({
    connectedTeamIds: s.connectedTeamIds.filter((id) => id !== teamId),
  })),

  setAudienceCount: (count) => set({ audienceCount: count }),

  setTileBlitzState: (data) => set((s) => ({
    tileBlitz: s.tileBlitz ? { ...s.tileBlitz, ...data } : (data as TileBlitzScreenState),
    // Sync status from tile blitz state updates (server sends session:state + tileblitz:state)
  })),

  setTileBlitzBonusClaimed: (data) => set((s) => ({
    tileBlitz: s.tileBlitz ? { ...s.tileBlitz, bonusClaimData: data } : s.tileBlitz,
  })),

  setTileBlitzBonusTimer: (data: { startTime: number; durationMs: number }) => set((s) => ({
    tileBlitz: s.tileBlitz
      ? { ...s.tileBlitz, bonusTimerStartTime: data.startTime, bonusTimerDurationMs: data.durationMs }
      : s.tileBlitz,
  })),

  setTileBlitzBonusResult: (data) => set((s) => ({
    tileBlitz: s.tileBlitz ? { ...s.tileBlitz, bonusResult: data } : s.tileBlitz,
    scores: data.scores,
  })),

  setCumulative: (data) => set({ 
    cumulativeData: data, 
    sessionStatus: SessionStatus.CUMULATIVE_REVEAL,
    isLastRound: data.isLastRound ?? false 
  }),

  setUCState: (data) => set((s) => ({
    ucState: data,
    // sessionStatus: data.activeTeamId ? SessionStatus.UC_ACTIVE : SessionStatus.UC_TEAM_SELECT,
    sessionStatus: data.status,
    scores: data.scores ?? s.scores,
  })),

  applyUCQuestionUpdate: (data) => set((s) => ({
    ucState: s.ucState ? {
      ...s.ucState,
      currentQuestion: data.nextQuestion,
      queueLength: data.queueLength,
      correctCount: data.correctCount,
    } : s.ucState,
    scores: data.scores ?? s.scores,
  })),

  applyUCTeamDone: (data) => set((s) => ({
    ucState: s.ucState ? {
      ...s.ucState,
      activeTeamId: null,
      activeTeamName: null,
      activeTeamColor: null,
      currentQuestion: null,
      correctCount: 0,
      timerDeadline: 0,
    } : s.ucState,
    sessionStatus: data.isLastTeam ? s.sessionStatus : SessionStatus.UC_TEAM_SELECT,
  })),

  setClueState: (data) => set({
    clueState: data,
    sessionStatus: data.buzzingTeamId ? SessionStatus.CLUE_ANSWERING : SessionStatus.CLUE_OPEN,
    scores: data.scores ?? [],
  }),

  applyClueNext: (data) => set((s) => ({
    clueState: s.clueState ? {
      ...s.clueState,
      currentClueIndex: data.clueIndex,
      currentClueText: data.clueText,
      pointsAvailable: data.pointsAvailable,
      timerDeadline: data.timerDeadline,
      buzzingTeamId: null,
      buzzingTeamName: null,
      buzzingTeamColor: null,
    } : s.clueState,
    sessionStatus: SessionStatus.CLUE_OPEN,
  })),

  applyClueAnswerResult: (data) => set((s) => ({
    clueState: s.clueState ? {
      ...s.clueState,
      lockedTeamIds: data.isCorrect
        ? s.clueState.lockedTeamIds
        : [...s.clueState.lockedTeamIds, data.teamId],
      buzzingTeamId: null,
      buzzingTeamName: null,
      buzzingTeamColor: null,
    } : s.clueState,
    sessionStatus: data.isCorrect ? SessionStatus.QUESTION_LOCKED : SessionStatus.CLUE_OPEN,
  })),
  
  setAudienceLevel: (level) => set({ audienceLevel: level }),
  
  setAudienceInteractionStart: (data) => set({
    activeInteraction: {
      ...data,
      deadline: Date.now() + data.durationMs,
      totalSubmissions: 0,
      tally: {},
    }
  }),

  updateAudienceInteraction: (data) => set((s) => ({
    activeInteraction: s.activeInteraction ? {
      ...s.activeInteraction,
      totalSubmissions: data.totalSubmissions,
      tally: data.tally ?? s.activeInteraction.tally,
    } : null
  })),

  closeAudienceInteraction: () => set({ activeInteraction: null }),

  showQROverlay: (data) => set({ qrOverlay: data }),
  hideQROverlay: () => set({ qrOverlay: null }),

  showRulesOverlay: (data) => set({ rulesOverlay: data }),
  hideRulesOverlay: () => set({ rulesOverlay: null }),

  reset: () => set({
    sessionStatus: null, currentRound: null, roundRules: null, currentQuestion: null,
    scores: [], connectedTeamIds: [], completedRoundIds: [], submittedTeamIds: [],
    revealData: null, roundSummary: null, sessionEndData: null, emojiCounts: {},
    tileBlitz: null, cumulativeData: null, isLastRound: false, currentRoundId: null, ucState: null, clueState: null,
    rulesOverlay: null, qrOverlay: null,
  }),
}))
