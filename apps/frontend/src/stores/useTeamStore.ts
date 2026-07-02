'use client'
import { create } from 'zustand'
import { SessionStatus, type Question, type TeamScore } from '@apoquiz/shared-types'
import type {
  QuestionOpenPayload,
  QuestionRevealPayload,
  RoundSummaryPayload,
  SessionEndPayload,
  SessionStatePayload,
  TimerData,
  TileBlitzBonusClaimedPayload,
  TileBlitzBonusResultPayload,
  TileState,
  CumulativeScoresPayload,
  UCStatePayload,
  UCQuestionUpdatePayload,
  UCTeamDonePayload,
  ClueStatePayload,
  ClueAnswerResultPayload,
  ClueNextPayload,
} from '@apoquiz/socket-events'

interface TeamStore {
  // identity (persisted in localStorage)
  teamId: string | null
  sessionId: string | null
  teamName: string | null
  teamColor: string | null
  pin: string | null

  // live state
  sessionStatus: SessionStatus | null
  currentRoundId: string | null
  score: number
  roundScores: Record<string, number>
  rank: number | null
  currentQuestion: Question | null
  timerData: TimerData | null
  submittedAnswer: string | null
  answerLocked: boolean
  timerElapsed: boolean
  revealData: QuestionRevealPayload | null
  roundSummary: RoundSummaryPayload | null
  sessionEndData: SessionEndPayload | null

  // Tile Blitz
  tileBlitzActiveTeamId: string | null
  tileBlitzBonusClaimed: TileBlitzBonusClaimedPayload | null
  tileBlitzBonusResult: TileBlitzBonusResultPayload | null
  tileBlitzBonusGrantedTeamId: string | null
  tileBlitzTurnOrderTeamIds: string[]
  tileBlitzCurrentTurnIndex: number
  tileBlitzTiles: TileState[]
  tileBlitzTurnsCompleted: number
  tileBlitzTotalTurns: number
  bonusTimerStartTime: number | null
  bonusTimerDurationMs: number | null
  bonusTimerElapsed: boolean
  cumulativeData: CumulativeScoresPayload | null
  ucState: UCStatePayload | null
  clueState: ClueStatePayload | null
  clueLockedOut: boolean // true if this team is locked out for current clue question
  suddenVictoryTiedTeamIds: string[]

  // actions
  setIdentity: (data: {
    teamId: string
    sessionId: string
    name: string
    color: string
    pin: string
  }) => void
  applySessionState: (data: SessionStatePayload) => void
  setRoundStart: (data: { round: { id: string } }) => void
  setCurrentQuestion: (
    data: QuestionOpenPayload & { activeTeamId?: string; isTileBlitz?: boolean },
  ) => void
  submitAnswer: (answer: string) => void
  setTimerElapsed: () => void
  setReveal: (data: QuestionRevealPayload) => void
  setRoundSummary: (data: RoundSummaryPayload) => void
  setSessionEnd: (data: SessionEndPayload) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTileBlitzState?: (data: any) => void
  setTileBlitzBonusClaimed?: (data: TileBlitzBonusClaimedPayload) => void
  setTileBlitzBonusResult?: (data: TileBlitzBonusResultPayload) => void
  setBonusTimer?: (data: { startTime: number; durationMs: number }) => void
  setBonusTimerElapsed?: () => void
  setCumulative?: (data: CumulativeScoresPayload) => void
  setUCState?: (data: UCStatePayload) => void
  applyUCQuestionUpdate?: (data: UCQuestionUpdatePayload) => void
  applyUCTeamDone?: (data: UCTeamDonePayload) => void
  setClueState?: (data: ClueStatePayload) => void
  applyClueNext: (data: ClueNextPayload) => void

  applyClueAnswerResult?: (data: ClueAnswerResultPayload) => void
  setAllAnswered: () => void
  setSuddenVictoryIntro?: (data: { tiedTeams: { teamId: string; teamName: string; teamColor: string; score: number }[]; questionCount: number }) => void
  reset: () => void
}

const initialState = {
  teamId: null,
  sessionId: null,
  teamName: null,
  teamColor: null,
  pin: null,
  sessionStatus: null,
  currentRoundId: null as string | null,
  score: 0,
  roundScores: {} as Record<string, number>,
  rank: null,
  currentQuestion: null,
  timerData: null,
  submittedAnswer: null,
  answerLocked: false,
  timerElapsed: false,
  revealData: null,
  roundSummary: null,
  sessionEndData: null,
  tileBlitzActiveTeamId: null,
  tileBlitzBonusClaimed: null,
  tileBlitzBonusResult: null,
  tileBlitzBonusGrantedTeamId: null,
  tileBlitzTurnOrderTeamIds: [] as string[],
  tileBlitzCurrentTurnIndex: 0,
  tileBlitzTiles: [] as TileState[],
  tileBlitzTurnsCompleted: 0,
  tileBlitzTotalTurns: 0,
  bonusTimerStartTime: null,
  bonusTimerDurationMs: null,
  bonusTimerElapsed: false,
  cumulativeData: null,
  ucState: null,
  clueState: null,
  clueLockedOut: false,
  suddenVictoryTiedTeamIds: [] as string[],
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  ...initialState,

  setIdentity({ teamId, sessionId, name, color, pin }) {
    set({ teamId, sessionId, teamName: name, teamColor: color, pin })
  },

  applySessionState(data) {
    const myScore = data.scores.find((s: TeamScore) => s.teamId === get().teamId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bonusTimerData = (data as any).bonusTimerData as
      | { startTime: number; durationMs: number }
      | undefined
    set({
      sessionStatus: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentRoundId: (data as any).currentRoundId ?? get().currentRoundId,
      score: myScore?.score ?? get().score,
      roundScores: myScore?.roundScores ?? get().roundScores,
      rank: myScore?.rank ?? get().rank,
      timerData: data.timerData ?? null,
      bonusTimerStartTime: bonusTimerData?.startTime ?? get().bonusTimerStartTime,
      bonusTimerDurationMs: bonusTimerData?.durationMs ?? get().bonusTimerDurationMs,
    })
  },

  setRoundStart(data) {
    set({ sessionStatus: SessionStatus.ROUND_INTRO, currentRoundId: data.round.id })
  },

  setCurrentQuestion(data) {
    set({
      sessionStatus: SessionStatus.QUESTION_OPEN,
      currentQuestion: data.question,
      timerData: { startTime: data.startTime, durationMs: data.durationMs },
      submittedAnswer: null,
      // For Tile Blitz: don't lock answer immediately; keep null until submitted
      answerLocked: false,
      timerElapsed: false,
      revealData: null,
      tileBlitzActiveTeamId: data.isTileBlitz ? (data.activeTeamId ?? null) : null,
      tileBlitzBonusClaimed: null,
      tileBlitzBonusResult: null,
      bonusTimerStartTime: null,
      bonusTimerDurationMs: null,
      bonusTimerElapsed: false,
    })
  },

  submitAnswer(answer) {
    // For Tile Blitz, submitting updates the pending answer but doesn't lock immediately
    set((s) => ({
      submittedAnswer: answer,
      answerLocked: !s.tileBlitzActiveTeamId, // Only lock immediately for Blitz mode
    }))
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTileBlitzState(data: any) {
    set({
      tileBlitzActiveTeamId: data.activeTeamId ?? null,
      tileBlitzTurnOrderTeamIds: data.turnOrderTeamIds ?? [],
      tileBlitzCurrentTurnIndex: data.currentTurnIndex ?? 0,
      tileBlitzTiles: data.tiles ?? [],
      tileBlitzTurnsCompleted: data.turnsCompleted ?? 0,
      tileBlitzTotalTurns: data.totalTurns ?? 0,
    })
  },

  setTileBlitzBonusClaimed(data: TileBlitzBonusClaimedPayload) {
    set({ tileBlitzBonusClaimed: data })
  },

  setTileBlitzBonusResult(data: TileBlitzBonusResultPayload) {
    set({ tileBlitzBonusResult: data })
  },

  setBonusTimer(data: { startTime: number; durationMs: number }) {
    set({
      bonusTimerStartTime: data.startTime,
      bonusTimerDurationMs: data.durationMs,
      bonusTimerElapsed: false,
    })
  },

  setBonusTimerElapsed() {
    set({ bonusTimerElapsed: true })
  },

  setCumulative(data: CumulativeScoresPayload) {
    set({ cumulativeData: data, sessionStatus: SessionStatus.CUMULATIVE_REVEAL })
  },

  setUCState(data: UCStatePayload) {
    set({
      ucState: data,
      // sessionStatus: data.activeTeamId ? SessionStatus.UC_ACTIVE : SessionStatus.UC_TEAM_SELECT,
      sessionStatus: data.status,
    })
  },

  applyUCQuestionUpdate(data: UCQuestionUpdatePayload) {
    const myTeamId = get().teamId
    const myScore = data.scores.find((s) => s.teamId === myTeamId)
    set((s) => ({
      ucState: s.ucState
        ? {
            ...s.ucState,
            currentQuestion: data.nextQuestion,
            queueLength: data.queueLength,
            correctCount: data.correctCount,
          }
        : s.ucState,
      ...(myScore ? {
        score: myScore.score,
        rank: myScore.rank,
        roundScores: myScore.roundScores,
      } : {}),
    }))
  },

  applyUCTeamDone(data: UCTeamDonePayload) {
    set((s) => ({
      ucState: s.ucState
        ? {
            ...s.ucState,
            activeTeamId: null,
            activeTeamName: null,
            activeTeamColor: null,
            currentQuestion: null,
            correctCount: 0,
            timerDeadline: 0,
          }
        : s.ucState,
      sessionStatus: data.isLastTeam ? s.sessionStatus : SessionStatus.UC_TEAM_SELECT,
    }))
  },

  setClueState(data: ClueStatePayload) {
    const myTeamId = get().teamId
    const isLockedOut = myTeamId ? data.lockedTeamIds.includes(myTeamId) : false
    set({
      clueState: data,
      clueLockedOut: isLockedOut,
      sessionStatus: data.buzzingTeamId ? SessionStatus.CLUE_ANSWERING : SessionStatus.CLUE_OPEN,
    })
  },

  applyClueNext: (data) =>
    set((s) => ({
      clueState: s.clueState
        ? {
            ...s.clueState,
            currentClueIndex: data.clueIndex,
            currentClueText: data.clueText,
            pointsAvailable: data.pointsAvailable,
            timerDeadline: data.timerDeadline,
            buzzingTeamId: null,
            buzzingTeamName: null,
            buzzingTeamColor: null,
          }
        : s.clueState,
      sessionStatus: SessionStatus.CLUE_OPEN,
    })),

  applyClueAnswerResult(data: ClueAnswerResultPayload) {
    const myTeamId = get().teamId
    set((s) => ({
      clueState: s.clueState
        ? {
            ...s.clueState,
            lockedTeamIds: data.isCorrect
              ? s.clueState.lockedTeamIds
              : [...s.clueState.lockedTeamIds, data.teamId],
            buzzingTeamId: null,
            buzzingTeamName: null,
            buzzingTeamColor: null,
          }
        : s.clueState,
      clueLockedOut: !data.isCorrect && data.teamId === myTeamId ? true : s.clueLockedOut,
      sessionStatus: data.isCorrect ? SessionStatus.QUESTION_LOCKED : SessionStatus.CLUE_OPEN,
    }))
  },

  setAllAnswered() {
    set({ sessionStatus: SessionStatus.QUESTION_LOCKED })
  },

  setTimerElapsed() {
    set({ sessionStatus: SessionStatus.QUESTION_LOCKED, timerElapsed: true })
  },

  setReveal(data) {
    const myResult = data.teamAnswers.find((a) => a.teamId === get().teamId)
    set({
      sessionStatus: SessionStatus.ANSWER_REVEAL,
      revealData: data,
      score:
        data.updatedScores.find((s: TeamScore) => s.teamId === get().teamId)?.score ?? get().score,
      roundScores:
        data.updatedScores.find((s: TeamScore) => s.teamId === get().teamId)?.roundScores ?? get().roundScores,
      rank:
        data.updatedScores.find((s: TeamScore) => s.teamId === get().teamId)?.rank ?? get().rank,
    })
    return myResult
  },

  setRoundSummary(data) {
    set({ sessionStatus: SessionStatus.ROUND_SUMMARY, roundSummary: data })
  },

  setSessionEnd(data) {
    set({ sessionStatus: SessionStatus.SESSION_END, sessionEndData: data })
  },

  setSuddenVictoryIntro(data) {
    set({
      sessionStatus: 'sudden_victory_intro' as SessionStatus,
      suddenVictoryTiedTeamIds: data.tiedTeams.map((t) => t.teamId),
    })
  },

  reset() {
    set(initialState)
  },
}))
