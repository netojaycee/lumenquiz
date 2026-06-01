'use client'
import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import { SERVER_EVENTS, CONNECTION_EVENTS, AUDIENCE_EVENTS } from '@apoquiz/socket-events'
import type {
  QuestionOpenPayload,
  QuestionRevealPayload,
  ScoresUpdatePayload,
  RoundStartPayload,
  RoundVoteOpenPayload,
  RoundVoteUpdatePayload,
  RoundSummaryPayload,
  SessionEndPayload,
  SessionStatePayload,
  EmojiReactPayload,
  AudiencePointsUpdatePayload,
  ErrorPayload,
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
import { UserRole, SessionStatus } from '@apoquiz/shared-types'
import { getSocketUrl } from '@/lib/api'
import { updateClockOffset } from '@/lib/clock'

// ─── Store module cache ───────────────────────────────────────────────────────
// Dynamic imports avoid circular dependency issues at module load time.
// We pre-warm them in connect() so all subsequent event handlers can call
// getState() synchronously without going through the microtask queue.

type ScreenStoreMod = typeof import('./useScreenStore')
type TeamStoreMod = typeof import('./useTeamStore')
type AudienceStoreMod = typeof import('./useAudienceStore')

let _screen: ScreenStoreMod | null = null
let _team: TeamStoreMod | null = null
let _audience: AudienceStoreMod | null = null

const ss = () => _screen?.useScreenStore.getState()
const ts = () => _team?.useTeamStore.getState()
const au = () => _audience?.useAudienceStore.getState()

// ─── Store interface ──────────────────────────────────────────────────────────

interface SocketStore {
  socket: Socket | null
  connected: boolean
  midSessionDisconnect: boolean  // true when socket drops AFTER a session was already active
  error: string | null
  connect: () => Socket
  disconnect: () => void
  emit: (event: string, data?: unknown) => void
  on: (event: string, handler: (data: unknown) => void) => void
  off: (event: string, handler: (data: unknown) => void) => void
  clearError: () => void
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,
  midSessionDisconnect: false,
  error: null,

  connect() {
    const existing = get().socket
    if (existing?.connected) return existing

    // Pre-warm store imports — dynamic to avoid circular deps at load time,
    // but resolved once and cached so all event handlers run synchronously.
    if (!_screen) void import('./useScreenStore').then(m => { _screen = m })
    if (!_team)   void import('./useTeamStore').then(m => { _team = m })
    if (!_audience) void import('./useAudienceStore').then(m => { _audience = m })

    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: {
        role: UserRole.MODERATOR,
      },
    })

    socket.on(CONNECTION_EVENTS.CONNECT, () => {
      set({ connected: true, error: null })
    })

    socket.on(CONNECTION_EVENTS.DISCONNECT, () => {
      // Only flag mid-session if we were already confirmed connected
      set((s) => ({ connected: false, midSessionDisconnect: s.connected }))
    })

    socket.on(CONNECTION_EVENTS.CONNECT_ERROR, (err: Error) => {
      set({ error: err.message, connected: false })
    })

    // ── Game event handlers ─────────────────────────────────────────────────

    socket.on(SERVER_EVENTS.SESSION_STATE, (data: SessionStatePayload) => {
      // Sync clock on every state snapshot — server always includes serverTime
      if ((data as any).serverTime) updateClockOffset((data as any).serverTime)
      // Session state received → reconnect succeeded, clear the overlay
      set({ midSessionDisconnect: false })
      ss()?.applySessionState(data)
      ts()?.applySessionState(data)
      au()?.applySessionState(data)
    })

    // Dedicated clock sync event for high-frequency updates (e.g. on question open)
    socket.on(SERVER_EVENTS.CLOCK_SYNC, (data: { serverTime: number }) => {
      updateClockOffset(data.serverTime)
    })

    socket.on(SERVER_EVENTS.ROUND_START, (data: RoundStartPayload) => {
      ss()?.setRoundStart(data)
      ts()?.setRoundStart()
      au()?.setRoundStart()
    })

    socket.on(
      SERVER_EVENTS.ROUND_RULES_SHOW,
      (data: { round: { name?: string | null }; rules: string[] }) => {
        ss()?.setRulesCard(data)
      },
    )

    socket.on(SERVER_EVENTS.QUESTION_OPEN, (data: QuestionOpenPayload) => {
      ss()?.setCurrentQuestion(data)
      ts()?.setCurrentQuestion(data)
      au()?.setCurrentQuestion(data)
    })

    socket.on(SERVER_EVENTS.QUESTION_ALL_ANSWERED, () => {
      ss()?.setAllAnswered()
      ts()?.setAllAnswered()
    })

    socket.on(SERVER_EVENTS.QUESTION_TIMER_ELAPSED, () => {
      ss()?.setTimerElapsed()
      ts()?.setTimerElapsed()
    })

    socket.on(SERVER_EVENTS.QUESTION_REVEAL, (data: QuestionRevealPayload) => {
      ss()?.setReveal(data)
      ts()?.setReveal(data)
      au()?.setReveal(data)
    })

    socket.on(SERVER_EVENTS.SCORES_UPDATE, (data: ScoresUpdatePayload) => {
      const store = ss()
      if (!store) return
      // Suppress premature score updates while a question is in progress — wait for reveal
      const { sessionStatus: status } = store
      if (status === SessionStatus.QUESTION_OPEN || status === SessionStatus.QUESTION_LOCKED) return
      store.setScores(data.scores)
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_OPEN, (data: RoundVoteOpenPayload) => {
      ss()?.setVoteOpen(data)
      au()?.setVoteOpen(data)
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_UPDATE, (data: RoundVoteUpdatePayload) => {
      ss()?.updateVote(data)
      au()?.updateVote(data)
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_CLOSE, () => {
      ss()?.setVoteClosed()
      au()?.setVoteClosed()
    })

    socket.on(SERVER_EVENTS.ROUND_SUMMARY, (data: RoundSummaryPayload) => {
      ss()?.setRoundSummary(data)
      ts()?.setRoundSummary(data)
      au()?.setRoundSummary(data)
    })

    socket.on(SERVER_EVENTS.SESSION_END, (data: SessionEndPayload) => {
      ss()?.setSessionEnd(data)
      ts()?.setSessionEnd(data)
      au()?.setSessionEnd(data)
    })

    // Audience prediction points — server emits to audience:{id} room after reveal
    socket.on(SERVER_EVENTS.AUDIENCE_POINTS_UPDATE, (data: AudiencePointsUpdatePayload) => {
      au()?.setPoints(data.totalPoints)
    })

    // Emoji reactions for screen (backend emits to screen room as AUDIENCE_EVENTS.REACT)
    socket.on(AUDIENCE_EVENTS.REACT, (data: EmojiReactPayload) => {
      ss()?.addEmojiReaction(data)
    })

    // Real-time audience head count (emitted on every join/leave)
    socket.on('audience:count:update', (data: { count: number }) => {
      ss()?.setAudienceCount(data.count)
    })

    // Team online presence — broadcast to full session room so screen + moderator both update
    socket.on('team:connected', (data: { teamId: string }) => {
      ss()?.setTeamConnected(data.teamId)
    })

    socket.on('team:disconnected', (data: { teamId: string }) => {
      ss()?.setTeamDisconnected(data.teamId)
    })

    // Tile Blitz specific events
    socket.on(SERVER_EVENTS.TILEBLITZ_STATE, (data: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ss()?.setTileBlitzState(data as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ts()?.setTileBlitzState?.(data as any)
    })

    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_CLAIMED, (data: TileBlitzBonusClaimedPayload) => {
      ss()?.setTileBlitzBonusClaimed(data)
      ts()?.setTileBlitzBonusClaimed?.(data)
    })

    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_RESULT, (data: TileBlitzBonusResultPayload) => {
      ss()?.setTileBlitzBonusResult(data)
      ts()?.setTileBlitzBonusResult?.(data)
    })

    // Bonus timer: received when moderator grants bonus — carries startTime + durationMs
    socket.on('tileblitz:bonus:granted', (data: { bonusTeamId: string; questionId: string; bonusTimerStartTime: number; bonusTimerDurationMs: number }) => {
      ss()?.setTileBlitzBonusTimer({ startTime: data.bonusTimerStartTime, durationMs: data.bonusTimerDurationMs })
      ts()?.setBonusTimer?.({ startTime: data.bonusTimerStartTime, durationMs: data.bonusTimerDurationMs })
    })

    // Bonus timer elapsed — server fires this when the half-time window closes
    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_TIMER_ELAPSED, () => {
      ts()?.setBonusTimerElapsed?.()
    })

    socket.on(SERVER_EVENTS.CUMULATIVE_SCORES, (data: CumulativeScoresPayload) => {
      ss()?.setCumulative(data)
      ts()?.setCumulative?.(data)
    })

    // Ultimate Challenge specific events
    socket.on(SERVER_EVENTS.UC_STATE, (data: UCStatePayload) => {
      ss()?.setUCState(data)
      ts()?.setUCState?.(data)
    })

    socket.on(SERVER_EVENTS.UC_QUESTION_UPDATE, (data: UCQuestionUpdatePayload) => {
      ss()?.applyUCQuestionUpdate(data)
      ts()?.applyUCQuestionUpdate?.(data)
    })

    socket.on(SERVER_EVENTS.UC_TEAM_DONE, (data: UCTeamDonePayload) => {
      ss()?.applyUCTeamDone(data)
      ts()?.applyUCTeamDone?.(data)
    })

    // Clue Reveal specific events
    socket.on(SERVER_EVENTS.CLUE_STATE, (data: ClueStatePayload) => {
      ss()?.setClueState(data)
      ts()?.setClueState?.(data)
    })

    socket.on(SERVER_EVENTS.CLUE_NEXT, (data: ClueNextPayload) => {
      ss()?.applyClueNext(data)
      ts()?.applyClueNext?.(data)
    })

    socket.on(SERVER_EVENTS.CLUE_TIMER_ELAPSED, () => {
      // Visual-only — no state change needed; UI can react via clueState.timerDeadline
    })

    socket.on(SERVER_EVENTS.CLUE_ANSWER_RESULT, (data: ClueAnswerResultPayload) => {
      ss()?.applyClueAnswerResult(data)
      ts()?.applyClueAnswerResult?.(data)
    })

    socket.on(SERVER_EVENTS.SCREEN_QR_SHOW, (data: { dataURL: string; url: string; ip: string }) => {
      ss()?.showQROverlay(data)
    })

    socket.on(SERVER_EVENTS.SCREEN_QR_HIDE, () => {
      ss()?.hideQROverlay()
    })

    socket.on(SERVER_EVENTS.RULES_OVERLAY_SHOW, (data: { roundName?: string | null; rules: string[] }) => {
      ss()?.showRulesOverlay(data)
    })

    socket.on(SERVER_EVENTS.RULES_OVERLAY_HIDE, () => {
      ss()?.hideRulesOverlay()
    })

    socket.on(SERVER_EVENTS.ERROR, (data: ErrorPayload) => {
      set({ error: data.message })
    })

    socket.connect()
    set({ socket, connected: false, error: null })
    return socket
  },

  disconnect() {
    get().socket?.disconnect()
    set({ socket: null, connected: false })
  },

  emit(event, data) {
    get().socket?.emit(event, data)
  },

  on(event, handler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get().socket?.on(event, handler as any)
  },

  off(event, handler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get().socket?.off(event, handler as any)
  },

  clearError() {
    set({ error: null })
  },
}))
