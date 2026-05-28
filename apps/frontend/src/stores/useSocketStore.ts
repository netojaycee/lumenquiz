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

interface SocketStore {
  socket: Socket | null
  connected: boolean
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
  error: null,

  connect() {
    const existing = get().socket
    if (existing?.connected) return existing

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
      set({ connected: false })
    })

    socket.on(CONNECTION_EVENTS.CONNECT_ERROR, (err: Error) => {
      set({ error: err.message, connected: false })
    })

    // ── Game event handlers ─────────────────────────────────────────────
    // These update role-specific stores. Stores imported inside handlers
    // to avoid circular dependency issues at module load time.

    socket.on(SERVER_EVENTS.SESSION_STATE, (data: SessionStatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().applySessionState(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().applySessionState(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().applySessionState(data)
      })
    })

    socket.on(SERVER_EVENTS.ROUND_START, (data: RoundStartPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setRoundStart(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setRoundStart()
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setRoundStart()
      })
    })

    socket.on(
      SERVER_EVENTS.ROUND_RULES_SHOW,
      (data: { round: { name?: string | null }; rules: string[] }) => {
        import('./useScreenStore').then(({ useScreenStore }) => {
          useScreenStore.getState().setRulesCard(data)
        })
      },
    )

    socket.on(SERVER_EVENTS.QUESTION_OPEN, (data: QuestionOpenPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setCurrentQuestion(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setCurrentQuestion(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setCurrentQuestion(data)
      })
    })

    socket.on(SERVER_EVENTS.QUESTION_ALL_ANSWERED, () => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setAllAnswered()
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setAllAnswered()
      })
    })

    socket.on(SERVER_EVENTS.QUESTION_TIMER_ELAPSED, () => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTimerElapsed()
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setTimerElapsed()
      })
    })

    socket.on(SERVER_EVENTS.QUESTION_REVEAL, (data: QuestionRevealPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setReveal(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setReveal(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setReveal(data)
      })
    })

    socket.on(SERVER_EVENTS.SCORES_UPDATE, (data: ScoresUpdatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        const status = useScreenStore.getState().sessionStatus
        // Suppress premature score updates while a question is in progress — wait for reveal
        if (status === SessionStatus.QUESTION_OPEN || status === SessionStatus.QUESTION_LOCKED) return
        useScreenStore.getState().setScores(data.scores)
      })
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_OPEN, (data: RoundVoteOpenPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setVoteOpen(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setVoteOpen(data)
      })
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_UPDATE, (data: RoundVoteUpdatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().updateVote(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().updateVote(data)
      })
    })

    socket.on(SERVER_EVENTS.ROUND_VOTE_CLOSE, () => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setVoteClosed()
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setVoteClosed()
      })
    })

    socket.on(SERVER_EVENTS.ROUND_SUMMARY, (data: RoundSummaryPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setRoundSummary(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setRoundSummary(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setRoundSummary(data)
      })
    })

    socket.on(SERVER_EVENTS.SESSION_END, (data: SessionEndPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setSessionEnd(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setSessionEnd(data)
      })
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setSessionEnd(data)
      })
    })

    // Audience prediction points — server emits to audience:{id} room after reveal
    socket.on(SERVER_EVENTS.AUDIENCE_POINTS_UPDATE, (data: AudiencePointsUpdatePayload) => {
      import('./useAudienceStore').then(({ useAudienceStore }) => {
        useAudienceStore.getState().setPoints(data.totalPoints)
      })
    })

    // Emoji reactions for screen (backend emits to screen room as AUDIENCE_EVENTS.REACT)
    socket.on(AUDIENCE_EVENTS.REACT, (data: EmojiReactPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().addEmojiReaction(data)
      })
    })

    // Real-time audience head count (emitted on every join/leave)
    socket.on('audience:count:update', (data: { count: number }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setAudienceCount(data.count)
      })
    })

    // Team online presence — broadcast to full session room so screen + moderator both update
    socket.on('team:connected', (data: { teamId: string }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTeamConnected(data.teamId)
      })
    })

    socket.on('team:disconnected', (data: { teamId: string }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTeamDisconnected(data.teamId)
      })
    })

    // Tile Blitz specific events
    socket.on(SERVER_EVENTS.TILEBLITZ_STATE, (data: unknown) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useScreenStore.getState().setTileBlitzState(data as any)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (useTeamStore.getState().setTileBlitzState)
          useTeamStore.getState().setTileBlitzState?.(data as any)
      })
    })

    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_CLAIMED, (data: TileBlitzBonusClaimedPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTileBlitzBonusClaimed(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setTileBlitzBonusClaimed?.(data)
      })
    })

    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_RESULT, (data: TileBlitzBonusResultPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTileBlitzBonusResult(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setTileBlitzBonusResult?.(data)
      })
    })

    // Bonus timer: received when moderator grants bonus — carries startTime + durationMs
    socket.on('tileblitz:bonus:granted', (data: { bonusTeamId: string; questionId: string; bonusTimerStartTime: number; bonusTimerDurationMs: number }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setTileBlitzBonusTimer({ startTime: data.bonusTimerStartTime, durationMs: data.bonusTimerDurationMs })
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setBonusTimer?.({ startTime: data.bonusTimerStartTime, durationMs: data.bonusTimerDurationMs })
      })
    })

    // Bonus timer elapsed — server fires this when the half-time window closes
    socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_TIMER_ELAPSED, () => {
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setBonusTimerElapsed?.()
      })
    })

    socket.on(SERVER_EVENTS.CUMULATIVE_SCORES, (data: CumulativeScoresPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setCumulative(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setCumulative?.(data)
      })
    })

    // Ultimate Challenge specific events
    socket.on(SERVER_EVENTS.UC_STATE, (data: UCStatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setUCState(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setUCState?.(data)
      })
    })

    socket.on(SERVER_EVENTS.UC_QUESTION_UPDATE, (data: UCQuestionUpdatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().applyUCQuestionUpdate(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().applyUCQuestionUpdate?.(data)
      })
    })

    socket.on(SERVER_EVENTS.UC_TEAM_DONE, (data: UCTeamDonePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().applyUCTeamDone(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().applyUCTeamDone?.(data)
      })
    })

    // Clue Reveal specific events
    socket.on(SERVER_EVENTS.CLUE_STATE, (data: ClueStatePayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().setClueState(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().setClueState?.(data)
      })
    })

    socket.on(SERVER_EVENTS.CLUE_NEXT, (data: ClueNextPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().applyClueNext(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().applyClueNext?.(data)
      })
    })

    socket.on(SERVER_EVENTS.CLUE_TIMER_ELAPSED, () => {
      // Visual-only — no state change needed; UI can react via clueState.timerDeadline
    })

    socket.on(SERVER_EVENTS.CLUE_ANSWER_RESULT, (data: ClueAnswerResultPayload) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().applyClueAnswerResult(data)
      })
      import('./useTeamStore').then(({ useTeamStore }) => {
        useTeamStore.getState().applyClueAnswerResult?.(data)
      })
    })

    socket.on(SERVER_EVENTS.SCREEN_QR_SHOW, (data: { dataURL: string; url: string; ip: string }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().showQROverlay(data)
      })
    })

    socket.on(SERVER_EVENTS.SCREEN_QR_HIDE, () => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().hideQROverlay()
      })
    })

    socket.on(SERVER_EVENTS.RULES_OVERLAY_SHOW, (data: { roundName?: string | null; rules: string[] }) => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().showRulesOverlay(data)
      })
    })

    socket.on(SERVER_EVENTS.RULES_OVERLAY_HIDE, () => {
      import('./useScreenStore').then(({ useScreenStore }) => {
        useScreenStore.getState().hideRulesOverlay()
      })
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
