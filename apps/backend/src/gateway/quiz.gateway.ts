import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import {
  activeSessions,
  type SessionCache,
  type CachedRound,
  type CachedTeamScore,
} from './session-cache'
import { mapPrismaQuestion, type PrismaQuestionWithOptions } from './question-mapper'
import {
  SERVER_EVENTS,
  MODERATOR_EVENTS,
  TEAM_EVENTS,
  AUDIENCE_EVENTS,
  CONNECTION_EVENTS,
  JOIN_EVENTS,
} from '@apoquiz/socket-events'
import type { TileState } from './session-cache'
import {
  SessionStatus,
  UserRole,
  GAME_CONSTANTS,
  type TeamScore,
  type TeamAnswerResult,
  type AudienceLeaderboardEntry,
  type SessionHighlights,
  type GameMode,
  Question,
  AudienceActivity,
  AudienceInteractionType,
  AudienceEngagementLevel,
} from '@apoquiz/shared-types'
import {
  BlitzMode,
  TileBlitzMode,
  UltimateChallengeMode,
  ClueRevealMode,
} from '@apoquiz/game-engine'
import type { GameModeStrategy } from '@apoquiz/game-engine'
import { NetworkService } from '../network/network.service'

// ─── Local types ──────────────────────────────────────────────────────────────

interface SocketData {
  role: UserRole
  sessionId: string
  teamId?: string
  audienceId?: string
}

// Extended over the shared RejoinPayload — includes nickname for first-time audience
interface JoinPayload {
  role: UserRole
  sessionId?: string
  teamCode?: string // single join credential for team role
  teamId?: string
  pin?: string
  audienceId?: string
  fingerprint?: string
  nickname?: string
}

// ─── Strategy registry ────────────────────────────────────────────────────────

const blitzMode = new BlitzMode()
const tileBlitzMode = new TileBlitzMode()
const ultimateChallengeMode = new UltimateChallengeMode()
const clueRevealMode = new ClueRevealMode()

function getStrategy(gameMode: string): GameModeStrategy {
  if (gameMode === 'blitz') return blitzMode
  if (gameMode === 'tile_blitz') return tileBlitzMode
  if (gameMode === 'ultimate_challenge') return ultimateChallengeMode
  if (gameMode === 'clue_reveal') return clueRevealMode
  // Phase 2 modes: fall back to blitz scoring until implemented
  return blitzMode
}

// ─── Vote broadcast throttle ──────────────────────────────────────────────────
// Prevents a broadcast storm when many audience members vote within the same
// short window (common at the start of a vote). Max one broadcast per 400 ms
// per session; the final tally is always flushed when the timer fires.
const voteThrottleTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ─── Gateway ──────────────────────────────────────────────────────────────────

@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket', 'polling'] })
export class QuizGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly network: NetworkService,
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  // On startup, clear any stale connected=true records left over from a previous
  // server run. If the server restarts, Socket.IO drops all sockets without firing
  // handleDisconnect, so the DB would otherwise retain stale connected:true forever.
  afterInit(): void {
    void this.prisma.sessionTeam
      .updateMany({ where: { connected: true }, data: { connected: false, socketId: null } })
      .then((r) => {
        if (r.count > 0) console.info(`[WS] Reset ${r.count} stale team connection(s) on startup`)
      })
      .catch(() => undefined)

    void this.prisma.audienceMember
      .updateMany({ where: { connected: true }, data: { connected: false, socketId: null } })
      .then((r) => {
        if (r.count > 0)
          console.info(`[WS] Reset ${r.count} stale audience connection(s) on startup`)
      })
      .catch(() => undefined)
  }

  handleConnection(client: Socket): void {
    console.info(`[WS] connected: ${client.id}`)
  }

  async handleDisconnect(client: Socket): Promise<void> {
    console.info(`[WS] disconnected: ${client.id}`)
    const data = client.data as SocketData | undefined
    if (!data?.sessionId) return

    if (data.role === UserRole.TEAM && data.teamId) {
      await this.prisma.sessionTeam
        .updateMany({
          where: { teamId: data.teamId, sessionId: data.sessionId },
          data: { connected: false, socketId: null },
        })
        .catch(() => undefined)

      const disconnectCache = activeSessions.get(data.sessionId)
      if (disconnectCache) disconnectCache.connectedTeamIds.delete(data.teamId)

      // Broadcast to full session room so projector screen also updates team status
      this.server.to(`session:${data.sessionId}`).emit('team:disconnected', { teamId: data.teamId })
    } else if (data.role === UserRole.AUDIENCE && data.audienceId) {
      await this.prisma.audienceMember
        .update({ where: { id: data.audienceId }, data: { connected: false, socketId: null } })
        .catch(() => undefined)

      const cache = activeSessions.get(data.sessionId)
      if (cache) {
        cache.audienceCount = Math.max(0, cache.audienceCount - 1)
        this.server
          .to(`session:${data.sessionId}`)
          .emit('audience:count:update', { count: cache.audienceCount })
      }
    }
  }

  // ─── session:rejoin — universal join/auth for all roles ────────────────────

  @SubscribeMessage(CONNECTION_EVENTS.REJOIN)
  async handleRejoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ): Promise<void> {
    const { role } = payload ?? {}
    if (!role) {
      client.emit(SERVER_EVENTS.ERROR, { code: 'BAD_PAYLOAD', message: 'role required' })
      return
    }

    // Teams authenticate with a single 8-char join code — no session code needed
    if (role === UserRole.TEAM) {
      if (!payload.teamCode) {
        client.emit(SERVER_EVENTS.ERROR, {
          code: 'MISSING_JOIN_CODE',
          message: 'Team join code required',
        })
        return
      }
      await this.joinAsTeamByCode(client, payload.teamCode)
      return
    }

    // All other roles require a session code
    const { sessionId } = payload
    if (!sessionId) {
      client.emit(SERVER_EVENTS.ERROR, { code: 'BAD_PAYLOAD', message: 'sessionId required' })
      return
    }

    // Resolve by raw id or sessionCode
    const upper = sessionId.toUpperCase()
    const session = (await this.prisma.session.findFirst({
      where: { OR: [{ id: sessionId }, { sessionCode: upper }] },
      include: {
        quiz: { select: { id: true, defaultAudienceLevel: true } },
        sessionTeams: {
          include: {
            team: {
              select: {
                id: true, name: true, color: true, pin: true,
                members: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
        audienceMembers: { where: { connected: true }, select: { id: true } },
      },
    })) as any

    if (!session) {
      client.emit(SERVER_EVENTS.ERROR, { code: 'SESSION_NOT_FOUND', message: 'Session not found' })
      return
    }

    const resolvedSessionId = session.id
    await this.ensureCache(session)

    // Block audience from joining before the host starts the session
    if (role === UserRole.AUDIENCE && session.status === 'pending') {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'SESSION_NOT_STARTED',
        message: 'Quiz has not started yet — please wait for the host to open the session',
      })
      return
    }

    switch (role) {
      case UserRole.MODERATOR:
        await this.joinAsModerator(client, payload, resolvedSessionId)
        break
      case UserRole.AUDIENCE:
        await this.joinAsAudience(client, payload, resolvedSessionId)
        break
      case UserRole.SCREEN:
        await this.joinAsScreen(client, resolvedSessionId)
        break
      default:
        client.emit(SERVER_EVENTS.ERROR, { code: 'INVALID_ROLE', message: 'Unknown role' })
    }
  }

  // ─── Join helpers ─────────────────────────────────────────────────────────────

  private async joinAsTeamByCode(client: Socket, teamCode: string): Promise<void> {
    const tc = teamCode.toUpperCase()

    const team = await this.prisma.team.findUnique({
      where: { joinCode: tc },
      select: { id: true, name: true, color: true, quizId: true },
    })
    if (!team) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'INVALID_JOIN_CODE',
        message: 'Invalid team join code',
      })
      return
    }

    const session = await this.prisma.session.findFirst({
      where: { quizId: team.quizId, status: { notIn: ['completed', 'pending'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: { select: { id: true, defaultAudienceLevel: true } },
        sessionTeams: {
          include: {
            team: {
              select: {
                id: true, name: true, color: true, pin: true,
                members: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
        audienceMembers: { where: { connected: true }, select: { id: true } },
      },
    })
    if (!session) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'NO_ACTIVE_SESSION',
        message: 'No active session for this team',
      })
      return
    }

    const st = session.sessionTeams.find((s: any) => s.teamId === team.id)
    if (!st) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'TEAM_NOT_IN_SESSION',
        message: 'Team is not in the current session',
      })
      return
    }

    await this.ensureCache(session)

    // If this socket was already registered as a different team (e.g. user pressed logout
    // then joined again without a real socket disconnect), clean up the old membership so the
    // projector doesn't show a ghost "connected" indicator for the previous team.
    const prev = client.data as SocketData | undefined
    if (prev?.role === UserRole.TEAM && prev.teamId && prev.teamId !== team.id) {
      void client.leave(`team:${prev.teamId}`)
      if (prev.sessionId && prev.sessionId !== session.id) {
        void client.leave(`session:${prev.sessionId}`)
        void client.leave(`session:${prev.sessionId}:teams`)
      }
      void this.prisma.sessionTeam
        .updateMany({
          where: { teamId: prev.teamId, sessionId: prev.sessionId },
          data: { connected: false, socketId: null },
        })
        .catch(() => undefined)
      const prevCache = activeSessions.get(prev.sessionId ?? '')
      if (prevCache) prevCache.connectedTeamIds.delete(prev.teamId)
      this.server
        .to(`session:${prev.sessionId}`)
        .emit('team:disconnected', { teamId: prev.teamId })
    }

    ;(client.data as SocketData) = { role: UserRole.TEAM, sessionId: session.id, teamId: team.id }
    await client.join([`session:${session.id}`, `session:${session.id}:teams`, `team:${team.id}`])
    await this.prisma.sessionTeam.updateMany({
      where: { teamId: team.id, sessionId: session.id },
      data: { connected: true, socketId: client.id },
    })

    const joinCache = activeSessions.get(session.id)
    if (joinCache) joinCache.connectedTeamIds.add(team.id)

    client.emit(JOIN_EVENTS.TEAM_JOINED, {
      teamId: team.id,
      name: team.name,
      color: team.color,
      sessionId: session.id,
    })
    client.emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(session.id))
    this.server
      .to(`session:${session.id}`)
      .emit('team:connected', { teamId: team.id, teamName: team.name })
  }

  private async joinAsModerator(
    client: Socket,
    payload: JoinPayload,
    sessionId: string,
  ): Promise<void> {
    if (!payload.pin || !this.auth.validateModeratorPin(payload.pin)) {
      client.emit(SERVER_EVENTS.ERROR, { code: 'INVALID_PIN', message: 'Invalid moderator PIN' })
      return
    }
    ;(client.data as SocketData) = { role: UserRole.MODERATOR, sessionId }
    await client.join([`session:${sessionId}`, `session:${sessionId}:moderator`])
    const cache = activeSessions.get(sessionId)
    if (cache) {
      client.emit('moderator:rounds', {
        rounds: cache.rounds,
        completedRoundIds: Array.from(cache.completedRoundIds),
      })
    }
    // Return real sessionId so client can navigate to correct URL
    client.emit(JOIN_EVENTS.MODERATOR_JOINED, { sessionId })
    client.emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
  }

  private async joinAsAudience(
    client: Socket,
    payload: JoinPayload,
    sessionId: string,
  ): Promise<void> {
    let audienceId = payload.audienceId
    const fingerprint = payload.fingerprint ?? client.id
    // Track whether this member was already counted in the live audience tally.
    // If connected===true in the DB, the socket never disconnected (e.g. UI redirected
    // but the WebSocket stayed open), so we must NOT double-count them.
    let alreadyCounted = false

    if (audienceId) {
      // Rejoin — verify the member belongs to this session
      const existing = await this.prisma.audienceMember.findFirst({
        where: { id: audienceId, sessionId },
      })
      if (!existing) {
        audienceId = undefined
      } else {
        alreadyCounted = existing.connected
        await this.prisma.audienceMember.update({
          where: { id: audienceId },
          data: { connected: true, socketId: client.id },
        })
      }
    }

    if (!audienceId) {
      // First join — full name required
      if (!payload.nickname?.trim()) {
        client.emit(SERVER_EVENTS.ERROR, {
          code: 'MISSING_NICKNAME',
          message: 'Full name required for first join',
        })
        return
      }
      const member = await this.prisma.audienceMember.create({
        data: {
          sessionId,
          fullName: payload.nickname.trim().slice(0, GAME_CONSTANTS.MAX_NICKNAME_LENGTH),
          fingerprint,
          connected: true,
          socketId: client.id,
        },
      })
      audienceId = member.id
      alreadyCounted = false
    }

    ;(client.data as SocketData) = { role: UserRole.AUDIENCE, sessionId, audienceId }
    await client.join([
      `session:${sessionId}`,
      `session:${sessionId}:audience`,
      `audience:${audienceId}`,
    ])

    // Fetch personal points before emitting state so the audience member's score
    // is restored atomically in a single event — avoids the race where a separate
    // AUDIENCE_POINTS_UPDATE fires before the dynamic store import resolves.
    const memberPoints = await this.prisma.audienceMember.findUnique({
      where: { id: audienceId },
      select: { totalPoints: true },
    })

    // Tell the client their audienceId so they can persist it to localStorage
    client.emit(JOIN_EVENTS.AUDIENCE_JOINED, { audienceId, sessionId })
    client.emit(SERVER_EVENTS.SESSION_STATE, {
      ...this.buildStateSnapshot(sessionId),
      personalTotalPoints: memberPoints?.totalPoints ?? 0,
    })

    const cache = activeSessions.get(sessionId)
    if (cache && !alreadyCounted) {
      cache.audienceCount++
      this.server
        .to(`session:${sessionId}`)
        .emit('audience:count:update', { count: cache.audienceCount })
    }
  }

  private async joinAsScreen(client: Socket, sessionId: string): Promise<void> {
    ;(client.data as SocketData) = { role: UserRole.SCREEN, sessionId }
    await client.join([`session:${sessionId}`, `session:${sessionId}:screen`])
    // Emit confirmation with real sessionId so client can navigate to correct URL
    client.emit(JOIN_EVENTS.SCREEN_JOINED, { sessionId })
    client.emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
  }

  // ─── Moderator: audience vote ─────────────────────────────────────────────────

  // ─── session:leave — explicit client-initiated disconnect ────────────────────
  // Fired by the frontend when a user clicks "logout". Runs the same cleanup as a
  // physical socket disconnect so the projector immediately removes the team indicator
  // without waiting for the next heartbeat timeout (up to 30 s on poor networks).
  @SubscribeMessage(CONNECTION_EVENTS.LEAVE)
  async handleSessionLeave(@ConnectedSocket() client: Socket): Promise<void> {
    await this.handleDisconnect(client)
    ;(client.data as SocketData) = {} as SocketData
  }

  @SubscribeMessage(MODERATOR_EVENTS.VOTE_OPEN)
  handleVoteOpen(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; roundId: string; durationMs?: number },
  ): void {
    if (!this.isModerator(client)) return
    const {
      sessionId,
      roundId,
      durationMs = GAME_CONSTANTS.AUDIENCE_VOTE_DEFAULT_SECONDS * 1000,
    } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.LOBBY) return

    cache.status = SessionStatus.AUDIENCE_VOTE
    cache.audienceVoteTally = {}
    cache.audienceVotePositionTally = {}
    void this.prisma.session.update({ where: { id: sessionId }, data: { status: 'audience_vote' } })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_VOTE_OPEN, {
      roundId,
      teams: this.teamsArray(cache),
      durationMs,
    })
  }

  @SubscribeMessage(MODERATOR_EVENTS.VOTE_CLOSE)
  handleVoteClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.AUDIENCE_VOTE) return

    cache.status = SessionStatus.LOBBY
    void this.prisma.session.update({ where: { id: sessionId }, data: { status: 'lobby' } })

    // Flush any pending throttle timer so the final tally is included in the close event
    const pendingTimer = voteThrottleTimers.get(sessionId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      voteThrottleTimers.delete(sessionId)
    }

    const totalVotes = Object.values(cache.audienceVoteTally).reduce((s, v) => s + v, 0)
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_VOTE_CLOSE, {
      tally: cache.audienceVoteTally,
      totalVotes,
    })
  }

  @SubscribeMessage(MODERATOR_EVENTS.SET_AUDIENCE_LEVEL)
  handleSetAudienceLevel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; level: AudienceEngagementLevel },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId, level } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    cache.audienceLevel = level
    void this.prisma.session
      .updateMany({
        where: { id: sessionId },
        data: { audienceLevel: level } as any, // casting because of prisma schema mismatch if not generated yet
      })
      .catch(() => undefined)

    this.server
      .to(`session:${sessionId}:moderator`)
      .emit('moderator:audience:level_updated', { level })
  }

  @SubscribeMessage(MODERATOR_EVENTS.TRIGGER_AUDIENCE_ACTIVITY)
  handleTriggerAudienceActivity(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; activity: AudienceActivity },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId, activity } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    // Trigger mode-specific manual activity
    this.startAudienceInteraction(sessionId, cache, activity)
  }

  // ─── Moderator: screen QR overlay ─────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.SCREEN_QR)
  async handleScreenQR(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; show: boolean },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId, show } = payload ?? {}
    if (!show) {
      this.server.to(`session:${sessionId}:screen`).emit(SERVER_EVENTS.SCREEN_QR_HIDE)
      return
    }
    const cache = activeSessions.get(sessionId)
    const code = cache?.sessionCode || sessionId
    const joinURL = `${this.network.getJoinURL(code)}&role=audience`
    const qr = await this.network.generateQR(joinURL)
    this.server.to(`session:${sessionId}:screen`).emit(SERVER_EVENTS.SCREEN_QR_SHOW, {
      dataURL: qr,
      url: joinURL,
      ip: this.network.getLocalIP(),
    })
  }

  // ─── Moderator: round rules overlay ──────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.RULES_TOGGLE)
  handleRulesToggle(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; show: boolean },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId, show } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.ROUND_INTRO) return

    if (!show) {
      this.server.to(`session:${sessionId}:screen`).emit(SERVER_EVENTS.RULES_OVERLAY_HIDE)
      return
    }

    const round = cache.rounds[cache.currentRoundIndex]
    if (!round) return
    const strategy = getStrategy(round.gameMode)
    this.server.to(`session:${sessionId}:screen`).emit(SERVER_EVENTS.RULES_OVERLAY_SHOW, {
      roundName: round.name,
      rules: strategy.rules,
    })
  }

  // ─── Moderator: round start ────────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.ROUND_START)
  async handleRoundStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; roundId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId, roundId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return
    if (cache.status !== SessionStatus.LOBBY && cache.status !== SessionStatus.AUDIENCE_VOTE) return

    if (cache.completedRoundIds.has(roundId)) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'ROUND_ALREADY_COMPLETED',
        message: 'This round has already been played',
      })
      return
    }

    const roundIndex = cache.rounds.findIndex((r) => r.id === roundId)
    if (roundIndex === -1) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'ROUND_NOT_FOUND',
        message: 'Round not found in session',
      })
      return
    }
    const round = cache.rounds[roundIndex]

    // Pre-load all questions for this round into cache — no DB reads during reveals
    const dbQuestions = await this.prisma.question.findMany({
      where: { roundId, deletedAt: null },
      include: { options: true },
      orderBy: { order: 'asc' },
    })

    const questions = dbQuestions.map((q) => mapPrismaQuestion(q as PrismaQuestionWithOptions))

    cache.currentRoundIndex = roundIndex
    cache.currentRoundId = roundId
    cache.currentRoundQuestions = questions
    cache.currentQuestionIndex = 0
    cache.submittedTeams = new Set()
    cache.status = SessionStatus.ROUND_INTRO

    // Initialise Tile Blitz state when the game mode is tile_blitz
    if (round.gameMode === 'tile_blitz') {
      const turnOrderTeamIds = Array.from(cache.teamScores.keys())
      // Each team gets questionCount turns; total = teams × turnsPerTeam
      const totalTurns = turnOrderTeamIds.length * round.questionCount
      cache.tileBlitz = {
        turnOrderTeamIds,
        currentTurnIndex: 0,
        tileStates: questions.map(
          (q, i): TileState => ({
            questionId: q.id,
            tileIndex: i,
            used: false,
            activeTeamId: null,
          }),
        ),
        bonusPointsPerQuestion: round.bonusPointsPerQuestion,
        pendingAnswer: null,
        bonusBuzzTeamId: null,
        bonusGranted: false,
        bonusTimerStartTime: null,
        bonusTimerDurationMs: null,
        bonusTimerHandle: null,
        turnsCompleted: 0,
        totalTurns,
      }
    } else if (round.gameMode === 'ultimate_challenge') {
      // ULTIMATE CHALLENGE MODE:
      //
      // - Each team gets a UNIQUE set of questions (no overlap)
      // - Questions are stored as a circular queue per team
      //   - correct → remove from queue
      //   - skip → move to end of queue
      //
      // - Moderator selects which team plays (no fixed order)
      //
      // - A team finishes when:
      //   1. queue is empty (all answered correctly)
      //   2. OR timer expires
      //
      // - Round ends when all teams are completed
      //
      // - initialQueueSizes is used for UI progress tracking — it never changes after initialisation, unlike teamQueues which is mutated as teams answer/skip

      const teamIds = Array.from(cache.teamScores.keys())

      // 🔀 Shuffle once to guarantee global uniqueness
      const shuffled = [...questions].sort(() => Math.random() - 0.5)

      const teamQueues = new Map<string, Question[]>()
      const initialQueueSizes = new Map<string, number>()

      const totalNeeded = teamIds.length * round.questionCount

      if (shuffled.length < totalNeeded) {
        throw new Error('Not enough questions for all teams')
      }
      // 🎯 Assign UNIQUE questions per team from one shared pool
      for (const teamId of teamIds) {
        const teamQuestions = shuffled.splice(0, round.questionCount)

        teamQueues.set(teamId, teamQuestions)
        initialQueueSizes.set(teamId, teamQuestions.length)
      }

      cache.ultimateChallenge = {
        // Moderator controls which team plays (no fixed order)
        activeTeamId: null,

        // Rule config
        questionsPerTeam: round.questionCount,

        // 🧠 Core gameplay state
        teamQueues, // Map<teamId, Question[]>
        initialQueueSizes, // Map<teamId, number>

        // ✅ Track which teams are done
        teamsCompleted: new Set<string>(),

        // ⏱ Timer (single active team at a time)
        timerDeadline: 0,
        timerHandle: null,
      }

      cache.tileBlitz = undefined
      cache.clueReveal = undefined
    } else if (round.gameMode === 'clue_reveal') {
      cache.tileBlitz = undefined
      cache.ultimateChallenge = undefined
      cache.clueReveal = {
        clues: [],
        currentClueIndex: 0,
        pointsAvailable: round.pointsPerQuestion,
        lockedTeamIds: new Set(),
        buzzingTeamId: null,
        clueTimerHandle: null,
        clueTimerDeadline: 0,
        answeringTimerHandle: null,
        answeringTimerDeadline: 0,
      }
    } else {
      cache.tileBlitz = undefined
      cache.ultimateChallenge = undefined
      cache.clueReveal = undefined
    }

    void this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'round_intro', currentRoundId: roundId },
    })

    const strategy = getStrategy(round.gameMode)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_START, {
      round: this.serializeRound(round, cache.quizId),
      scores: this.scoresArray(cache),
    })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_RULES_SHOW, {
      round: this.serializeRound(round, cache.quizId),
      rules: strategy.rules,
    })
  }

  // ─── Moderator: reveal question (first question of a round) ──────────────────

  @SubscribeMessage(MODERATOR_EVENTS.QUESTION_REVEAL)
  async handleQuestionReveal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.ROUND_INTRO) return

    const round = cache.rounds[cache.currentRoundIndex]
    if (round?.gameMode === 'tile_blitz') {
      // Tile Blitz: go to tile selection state instead of opening a question directly
      await this.enterTileSelect(sessionId, cache)
    } else if (round?.gameMode === 'ultimate_challenge') {
      await this.enterUCTeamSelect(sessionId, cache)
    } else if (round?.gameMode === 'clue_reveal') {
      await this.openClueRevealQuestion(sessionId, cache)
    } else {
      await this.openNextQuestion(sessionId, cache)
    }
  }

  // ─── Moderator: reveal answer ─────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.ANSWER_REVEAL)
  async handleAnswerReveal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    // Also accept BONUS_ANSWERING status for Tile Blitz bonus reveals (handled by dedicated event)
    if (!cache || cache.status !== SessionStatus.QUESTION_LOCKED) return

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question) return

    const currentRound = cache.rounds[cache.currentRoundIndex]
    const isTileBlitz = currentRound?.gameMode === 'tile_blitz'

    const isLastQuestion = (() => {
      if (currentRound?.gameMode === 'ultimate_challenge') return false // UC ends when teams are done
      return cache.currentQuestionIndex + 1 >= Math.min(cache.currentRoundQuestions.length, currentRound?.questionCount ?? 999)
    })()

    // for tile blitz it is end if last question and the answer is right, else we have bonus and should end there
    const isLastTileBlitzTurn =
      (cache.tileBlitz?.turnsCompleted ?? 0) + 1 >= (cache.tileBlitz?.totalTurns ?? 0)
    // const isBonusPending = cache.status === SessionStatus.BONUS_ANSWERING
    // 🚨 NEW RULE: bonus overrides flow end
    // const isBonusBlocking = isTileBlitz && isBonusPending

    // const isEndOfFlow = isTileBlitz ? isLastTileBlitzTurn && !isBonusBlocking : isLastQuestion
    // const isEndOfFlow = isTileBlitz ? isLastTileBlitzTurn : isLastQuestion

    cache.status = SessionStatus.ANSWER_REVEAL
    void this.prisma.session.update({ where: { id: sessionId }, data: { status: 'answer_reveal' } })

    // Mark question as revealed so it won't be reused
    void this.prisma.question
      .update({ where: { id: question.id }, data: { status: 'revealed' } })
      .catch(() => undefined)

    // Load answers from DB for this question + session
    const dbAnswers = await this.prisma.teamAnswer.findMany({
      where: { questionId: question.id, sessionId },
      include: { team: { select: { id: true, name: true, color: true } } },
    })

    let activeTeamAnswer = null
    const activeTeamId =
      cache.tileBlitz?.turnOrderTeamIds?.[cache.tileBlitz?.currentTurnIndex] ?? null

    if (isTileBlitz && activeTeamId) {
      activeTeamAnswer = dbAnswers.find((a) => a.teamId === activeTeamId)
    }

    let isEndOfFlow = false

    if (isTileBlitz) {
      const isActiveCorrect = activeTeamAnswer?.isCorrect === true

      // 🚨 ONLY end if LAST question AND correct
      isEndOfFlow = isLastTileBlitzTurn && isActiveCorrect
    } else {
      isEndOfFlow = isLastQuestion
    }

    const answeredTeamIds = new Set(dbAnswers.map((a) => a.teamId))
    const teamAnswers: TeamAnswerResult[] = dbAnswers.map((a) => ({
      teamId: a.teamId,
      teamName: a.team.name,
      teamColor: a.team.color,
      submittedAnswer: a.submittedAnswer,
      isCorrect: a.isCorrect,
      pointsEarned: a.pointsEarned,
      timeRemaining: a.timeRemaining,
    }))

    // Add placeholder entries for teams that were expected to answer but didn't submit.
    // Turn-based modes (Tile Blitz, Clue Reveal) have only one participant per question —
    // non-active teams are spectators and must NOT receive a phantom "Wrong" entry.
    const isClueReveal = currentRound?.gameMode === 'clue_reveal'
    if (isTileBlitz) {
      // Only the active team was expected to answer
      if (activeTeamId && !answeredTeamIds.has(activeTeamId)) {
        const ts = cache.teamScores.get(activeTeamId)
        if (ts) {
          teamAnswers.push({
            teamId: activeTeamId,
            teamName: ts.teamName,
            teamColor: ts.teamColor,
            submittedAnswer: '',
            isCorrect: false,
            pointsEarned: 0,
            timeRemaining: 0,
          })
        }
      }
    } else if (!isClueReveal) {
      // Blitz and other simultaneous modes: all teams are expected to answer
      for (const [tid, ts] of cache.teamScores) {
        if (!answeredTeamIds.has(tid)) {
          teamAnswers.push({
            teamId: tid,
            teamName: ts.teamName,
            teamColor: ts.teamColor,
            submittedAnswer: '',
            isCorrect: false,
            pointsEarned: 0,
            timeRemaining: 0,
          })
        }
      }
    }
    // Clue Reveal: only teams that actually submitted appear — no placeholders needed

    const scores = this.scoresArray(cache)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.QUESTION_REVEAL, {
      questionId: question.id,
      correctAnswer: question.correctAnswer,
      teamAnswers,
      updatedScores: scores,
      isLastQuestion: isTileBlitz ? isLastTileBlitzTurn : isLastQuestion,
    })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SCORES_UPDATE, { scores })

    // Resolve audience per-question engagement via overlay interactions only (fire-and-forget)
    void this.resolveAudienceInteractions(
      sessionId,
      question.id,
      dbAnswers.map((a) => ({ teamId: a.teamId, isCorrect: a.isCorrect })),
    )

    if (isEndOfFlow) {
      cache.status = SessionStatus.QUESTION_SUMMARY
      void this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'question_summary' },
      })
      this.server
        .to(`session:${sessionId}:moderator`)
        .emit('round:ready:summary', { sessionId, roundId: cache.currentRoundId })
    }
  }

  // ─── Moderator: next question ─────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.NEXT_QUESTION)
  async handleNextQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.ANSWER_REVEAL) return

    // Tile Blitz and Clue Reveal use their own next-turn events; regular Blitz advances linearly
    const round = cache.rounds[cache.currentRoundIndex]
    if (round?.gameMode === 'tile_blitz') return // handled by TILEBLITZ_NEXT_TURN
    if (round?.gameMode === 'clue_reveal') {
      const nextIndex = cache.currentQuestionIndex + 1
      if (nextIndex < cache.currentRoundQuestions.length) {
        cache.currentQuestionIndex = nextIndex
        await this.openClueRevealQuestion(sessionId, cache)
      }
      return
    }

    const nextIndex = cache.currentQuestionIndex + 1
    const maxQuestions = round?.questionCount ?? cache.currentRoundQuestions.length

    if (nextIndex < cache.currentRoundQuestions.length && nextIndex < maxQuestions) {
      cache.currentQuestionIndex = nextIndex
      await this.openNextQuestion(sessionId, cache)
    } else {
      // this is handled in reveal answer and bonus
      // Last question complete — moderator will trigger round summary
      // cache.status = SessionStatus.QUESTION_SUMMARY
      // void this.prisma.session.update({
      //   where: { id: sessionId },
      //   data: { status: 'question_summary' },
      // })
      // Signal moderator that round is ready to summarise
      // this.server
      //   .to(`session:${sessionId}:moderator`)
      //   .emit('round:ready:summary', { sessionId, roundId: cache.currentRoundId })
    }
  }

  // ─── Moderator: round summary ─────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.ROUND_SUMMARY)
  async handleRoundSummary(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (
      !cache ||
      (cache.status !== SessionStatus.QUESTION_SUMMARY &&
        cache.status !== SessionStatus.ANSWER_REVEAL)
    )
      return

    const roundId = cache.currentRoundId
    if (!roundId) return

    cache.completedRoundIds.add(roundId)
    cache.status = SessionStatus.ROUND_SUMMARY
    void this.prisma.session.update({ where: { id: sessionId }, data: { status: 'round_summary' } })

    // Persist final round scores to DB for all teams
    for (const [teamId, td] of cache.teamScores) {
      void this.prisma.sessionTeam
        .updateMany({
          where: { teamId, sessionId },
          data: {
            score: td.score,
            roundScores: JSON.stringify(td.roundScores),
          },
        })
        .catch(() => undefined)
    }

    // Round points earned this round per team
    const roundPoints: Record<string, number> = {}
    for (const [teamId, td] of cache.teamScores) {
      roundPoints[teamId] = td.roundScores[roundId] ?? 0
    }

    const audiencePredictionResults = await this.resolveRoundPredictions(sessionId, roundId, cache)
    const audienceLeaderboard = await this.audienceLeaderboard(sessionId)
    const round = cache.rounds[cache.currentRoundIndex]

    // Compute audience stats for the round
    const roundQuestionIds = cache.currentRoundQuestions.map((q) => q.id)
    const totalInteractions = await this.prisma.audienceInteraction.count({
      where: {
        sessionId,
        questionId: { in: roundQuestionIds },
      },
    })

    const correctInteractions = await this.prisma.audienceInteraction.count({
      where: {
        sessionId,
        questionId: { in: roundQuestionIds },
        isCorrect: true,
      },
    })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_SUMMARY, {
      roundId,
      roundName: round?.name ?? undefined,
      teamScores: this.scoresArray(cache),
      roundPoints,
      audiencePredictionResults,
      audienceLeaderboard,
      audienceStats: {
        totalInteractions,
        correctInteractions,
        accuracyPercentage:
          totalInteractions > 0 ? Math.round((correctInteractions / totalInteractions) * 100) : 0,
      },
      isLastRound: cache.completedRoundIds.size >= cache.rounds.length,
    })
  }

  // ─── Moderator: next round ────────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.SHOW_CUMULATIVE)
  async handleShowCumulative(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (
      !cache ||
      (cache.status !== SessionStatus.ROUND_SUMMARY &&
        cache.status !== SessionStatus.CUMULATIVE_REVEAL)
    )
      return

    cache.status = SessionStatus.CUMULATIVE_REVEAL
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'cumulative_reveal' } })
      .catch(() => undefined)

    const finalScores = this.scoresArray(cache)
    const audienceLeaderboard = await this.audienceLeaderboard(sessionId)
    const completedCount = cache.completedRoundIds.size
    const isLastRound = completedCount >= cache.rounds.length

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CUMULATIVE_SCORES, {
      finalScores,
      audienceLeaderboard,
      isLastRound,
    })

    if (isLastRound) {
      // cache.status = SessionStatus.QUESTION_SUMMARY
      // void this.prisma.session.update({
      //   where: { id: sessionId },
      //   data: { status: 'question_summary' },
      // })
      this.server
        .to(`session:${sessionId}:moderator`)
        .emit('round:final:quiz', { sessionId, roundId: cache.currentRoundId })
    }
  }

  @SubscribeMessage(MODERATOR_EVENTS.NEXT_ROUND)
  handleNextRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (
      !cache ||
      (cache.status !== SessionStatus.ROUND_SUMMARY &&
        cache.status !== SessionStatus.CUMULATIVE_REVEAL)
    )
      return

    // Reset per-round state, return to lobby so moderator can open vote or start next round
    cache.status = SessionStatus.LOBBY
    cache.currentRoundId = null
    cache.currentRoundQuestions = []
    cache.currentQuestionIndex = 0
    cache.submittedTeams = new Set()
    cache.audienceVoteTally = {}
    cache.audienceVotePositionTally = {}

    void this.prisma.session.update({ where: { id: sessionId }, data: { status: 'lobby' } })

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))

    // Re-send rounds list to moderator with updated completedRoundIds
    this.server.to(`session:${sessionId}:moderator`).emit('moderator:rounds', {
      rounds: cache.rounds,
      completedRoundIds: Array.from(cache.completedRoundIds),
    })
  }

  // ─── Moderator: session end ───────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.SESSION_END)
  async handleSessionEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    cache.status = SessionStatus.SESSION_END

    const finalScores = this.scoresArray(cache)
    const leaderboard = await this.audienceLeaderboard(sessionId, 50)
    const highlights = await this.computeHighlights(sessionId)

    void this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'session_end', endedAt: new Date() },
    })
    void this.prisma.quiz
      .update({
        where: { id: cache.quizId },
        data: { status: 'completed' },
      })
      .catch(() => undefined)

    const correctInteractions = await this.prisma.audienceInteraction.count({
      where: { sessionId, isCorrect: true },
    })
    const totalInteractions = await this.prisma.audienceInteraction.count({
      where: { sessionId },
    })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SESSION_END, {
      finalScores,
      highlights,
      audienceLeaderboard: leaderboard,
      audienceWinner: leaderboard[0] ?? null,
      audienceStats: {
        totalInteractions,
        correctInteractions,
        accuracyPercentage:
          totalInteractions > 0 ? Math.round((correctInteractions / totalInteractions) * 100) : 0,
      },
    })

    // Evict cache after a grace period so late-joining clients still get state
    setTimeout(() => activeSessions.delete(sessionId), 5 * 60 * 1000)
  }

  // ─── Moderator: timer pause / resume ─────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TIMER_PAUSE)
  handleTimerPause(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; paused: boolean },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId, paused } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.QUESTION_OPEN) return

    if (paused && !cache.pausedAt) {
      const now = Date.now()
      cache.pausedAt = now
      cache.remainingMsAtPause = Math.max(0, cache.timerDeadline - now)
      if (cache.questionTimerHandle) {
        clearTimeout(cache.questionTimerHandle)
        cache.questionTimerHandle = null
      }
    } else if (!paused && cache.pausedAt !== null) {
      const remaining = cache.remainingMsAtPause ?? 0
      cache.timerDeadline = Date.now() + remaining
      cache.pausedAt = null
      cache.remainingMsAtPause = null
      cache.questionTimerHandle = setTimeout(() => void this.onTimerElapsed(sessionId), remaining)
    }
  }

  // ─── Moderator: score override ────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.SCORE_OVERRIDE)
  handleScoreOverride(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { sessionId: string; teamId: string; adjustment: number; reason?: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId, teamId, adjustment } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    const td = cache.teamScores.get(teamId)
    if (!td) return

    td.score = Math.max(0, td.score + adjustment)
    void this.prisma.sessionTeam
      .updateMany({ where: { teamId, sessionId }, data: { score: td.score } })
      .catch(() => undefined)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SCORES_UPDATE, { scores: this.scoresArray(cache) })
  }

  // ─── Team: answer submit ──────────────────────────────────────────────────────

  @SubscribeMessage(TEAM_EVENTS.ANSWER_SUBMIT)
  async handleAnswerSubmit(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    payload: {
      teamId: string
      questionId: string
      sessionId: string
      answer: string
    },
  ): Promise<void> {
    const serverTs = Date.now()
    const { teamId, questionId, sessionId, answer } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    const isBonusAnswering = cache.status === SessionStatus.BONUS_ANSWERING
    const isClueAnswering = cache.status === SessionStatus.CLUE_ANSWERING
    const isLocked = cache.status === SessionStatus.QUESTION_LOCKED
    const validQuestionStatus =
      cache.status === SessionStatus.QUESTION_OPEN || isLocked
    if (!isBonusAnswering && !isClueAnswering && !validQuestionStatus) return
    // Accept answers with a grace window to account for network round-trip time:
    // - QUESTION_OPEN: 500 ms for internet latency (team submits "in time" but packet arrives late)
    // - QUESTION_LOCKED: 2 s for auto-submit code running after the timer elapsed event
    const NETWORK_GRACE_MS = 500
    const LATE_GRACE_MS = 2000
    const deadline = cache.timerDeadline + (isLocked ? LATE_GRACE_MS : NETWORK_GRACE_MS)
    if (!isBonusAnswering && !isClueAnswering && serverTs > deadline) return

    // Clue Reveal: only the buzzing team can submit
    if (isClueAnswering) {
      const cr = cache.clueReveal
      if (!cr || teamId !== cr.buzzingTeamId) return
      await this.handleClueAnswer(sessionId, cache, teamId, questionId, answer)
      return
    }

    // Tile Blitz: active team may freely update their pending answer; others cannot submit
    const round = cache.rounds[cache.currentRoundIndex]
    if (round?.gameMode === 'tile_blitz') {
      const tb = cache.tileBlitz
      if (!tb) return

      if (isBonusAnswering) {
        // Only the granted bonus team can submit
        if (teamId !== tb.bonusBuzzTeamId || !tb.bonusGranted) return
        // Reject submissions after the bonus timer has elapsed (2 s grace for auto-submit)
        if (
          tb.bonusTimerStartTime !== null &&
          tb.bonusTimerDurationMs !== null &&
          serverTs > tb.bonusTimerStartTime + tb.bonusTimerDurationMs + 2000
        )
          return
        tb.pendingAnswer = answer
        const bonusTd = cache.teamScores.get(teamId)
        this.server
          .to(`session:${sessionId}:moderator`)
          .emit(SERVER_EVENTS.TILEBLITZ_PENDING_ANSWER, {
            teamId,
            teamName: bonusTd?.teamName ?? teamId,
            teamColor: bonusTd?.teamColor ?? '#888',
            answer,
            isBonus: true,
          })
        return
      }

      const activeTeamId = tb.turnOrderTeamIds[tb.currentTurnIndex]
      if (teamId !== activeTeamId) return // not your turn
      tb.pendingAnswer = answer
      const activeTd = cache.teamScores.get(teamId)
      this.server
        .to(`session:${sessionId}:moderator`)
        .emit(SERVER_EVENTS.TILEBLITZ_PENDING_ANSWER, {
          teamId,
          teamName: activeTd?.teamName ?? teamId,
          teamColor: activeTd?.teamColor ?? '#888',
          answer,
          isBonus: false,
        })
      return // do not score yet; answer is provisional until lock
    }

    if (cache.submittedTeams.has(teamId)) return // already submitted (atomic, Blitz only)

    cache.submittedTeams.add(teamId)

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question || question.id !== questionId) return

    const strategy = getStrategy(round?.gameMode ?? 'blitz')

    const validation = strategy.validateAnswer(answer, question)
    const timeRemainingMs = Math.max(0, cache.timerDeadline - serverTs)
    const pointsEarned = strategy.calculateScore({
      basePoints: question.points,
      timeRemainingMs,
      timerDurationMs: cache.timerDurationMs,
      isCorrect: validation.correct,
    })

    // Update in-memory score immediately
    const td = cache.teamScores.get(teamId)
    if (td) {
      td.score += pointsEarned
      if (cache.currentRoundId) {
        td.roundScores[cache.currentRoundId] =
          (td.roundScores[cache.currentRoundId] ?? 0) + pointsEarned
      }
    }

    // Persist to DB — don't await, don't block the socket loop
    void this.prisma
      .$transaction([
        this.prisma.teamAnswer.create({
          data: {
            questionId,
            teamId,
            sessionId,
            submittedAnswer: answer,
            isCorrect: validation.correct,
            pointsEarned,
            timeRemaining: timeRemainingMs,
          },
        }),
        ...(td
          ? [
              this.prisma.sessionTeam.updateMany({
                where: { teamId, sessionId },
                data: { score: td.score },
              }),
            ]
          : []),
      ])
      .catch(() => undefined)

    // Track tiebreaker data: running total of timeRemaining on correct answers
    if (validation.correct && td) {
      td.correctAnswerTimeMs += timeRemainingMs
    }

    // Check if all teams have now submitted
    if (cache.submittedTeams.size >= cache.teamScores.size) {
      if (cache.questionTimerHandle) {
        clearTimeout(cache.questionTimerHandle)
        cache.questionTimerHandle = null
      }
      this.lockQuestion(sessionId, cache)
      // Broadcast to full session room — projector stops timer animation, moderator shows reveal button
      this.server
        .to(`session:${sessionId}`)
        .emit(SERVER_EVENTS.QUESTION_ALL_ANSWERED, { questionId, sessionId })
    }
  }

  // ─── Tile Blitz: select tile ─────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_SELECT_TILE)
  async handleTileBlitzSelectTile(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; questionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId, questionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.TILE_SELECT) return

    const tb = cache.tileBlitz
    if (!tb) return

    const tile = tb.tileStates.find((t) => t.questionId === questionId)
    if (!tile || tile.used) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'TILE_UNAVAILABLE',
        message: 'This tile has already been played',
      })
      return
    }

    // Find the question in pre-loaded list
    const questionIndex = cache.currentRoundQuestions.findIndex((q) => q.id === questionId)
    if (questionIndex === -1) return

    const activeTeamId = tb.turnOrderTeamIds[tb.currentTurnIndex]
    tile.activeTeamId = activeTeamId
    tile.used = true
    tb.pendingAnswer = null

    cache.currentQuestionIndex = questionIndex

    const durationMs = (cache.rounds[cache.currentRoundIndex]?.timerSeconds ?? 30) * 1000
    const startTime = Date.now()
    cache.questionStartTime = startTime
    cache.timerDeadline = startTime + durationMs
    cache.timerDurationMs = durationMs
    cache.submittedTeams = new Set()
    cache.status = SessionStatus.QUESTION_OPEN
    cache.pausedAt = null
    cache.remainingMsAtPause = null

    if (cache.questionTimerHandle) clearTimeout(cache.questionTimerHandle)
    cache.questionTimerHandle = setTimeout(() => void this.onTimerElapsed(sessionId), durationMs)

    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'question_open', currentQuestionId: questionId },
      })
      .catch(() => undefined)

    const question = cache.currentRoundQuestions[questionIndex]

    // Sync clocks immediately before revealing the question — critical for timer accuracy
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLOCK_SYNC, { serverTime: Date.now() })
    // Broadcast tile selection + question to all
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.QUESTION_OPEN, {
      questionId,
      question,
      startTime,
      durationMs,
      questionIndex,
      totalQuestions: cache.currentRoundQuestions.length,

      // Tile Blitz extensions
      activeTeamId,
      isTileBlitz: true,
    })

    // Send updated tile grid state
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.TILEBLITZ_STATE, this.buildTileBlitzState(tb, cache))

    // Audience Engagement
    this.checkAndTriggerAudienceActivity(sessionId, cache)
  }

  // ─── Tile Blitz: early lock ───────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_LOCK_QUESTION)
  async handleTileBlitzLockQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.QUESTION_OPEN) return

    const round = cache.rounds[cache.currentRoundIndex]
    if (round?.gameMode !== 'tile_blitz') return

    if (cache.questionTimerHandle) {
      clearTimeout(cache.questionTimerHandle)
      cache.questionTimerHandle = null
    }

    await this.lockTileBlitzQuestion(sessionId, cache)
  }

  // ─── Tile Blitz: bonus open ───────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_BONUS_OPEN)
  handleTileBlitzBonusOpen(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.ANSWER_REVEAL) return

    const tb = cache.tileBlitz
    if (!tb) return

    // Clear any lingering bonus timer from a previous grant
    if (tb.bonusTimerHandle) {
      clearTimeout(tb.bonusTimerHandle)
      tb.bonusTimerHandle = null
    }
    tb.bonusBuzzTeamId = null
    tb.bonusGranted = false
    tb.bonusTimerStartTime = null
    tb.bonusTimerDurationMs = null
    cache.status = SessionStatus.BONUS_OPEN

    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'bonus_open' } })
      .catch(() => undefined)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
  }

  // ─── Tile Blitz: team buzz-in ─────────────────────────────────────────────────

  @SubscribeMessage(TEAM_EVENTS.TILEBLITZ_BONUS_BUZZ)
  handleTileBlitzBonusBuzz(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { teamId: string; sessionId: string },
  ): void {
    const { teamId, sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.BONUS_OPEN) return

    const tb = cache.tileBlitz
    if (!tb) return
    if (tb.bonusBuzzTeamId) return // already claimed

    // Active team cannot buzz in for their own question's bonus
    const activeTeamId = tb.turnOrderTeamIds[tb.currentTurnIndex]
    if (teamId === activeTeamId) return

    tb.bonusBuzzTeamId = teamId
    const buzzTeamScore = cache.teamScores.get(teamId)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.TILEBLITZ_BONUS_CLAIMED, {
      teamId,
      teamName: buzzTeamScore?.teamName ?? teamId,
      teamColor: buzzTeamScore?.teamColor ?? '#888',
    })
  }

  // ─── Tile Blitz: grant bonus to buzzing team ──────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_BONUS_GRANT)
  handleTileBlitzBonusGrant(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.BONUS_OPEN) return

    const tb = cache.tileBlitz
    if (!tb || !tb.bonusBuzzTeamId) return

    tb.bonusGranted = true
    tb.pendingAnswer = null // reset pending for bonus answering

    // Bonus timer = half the round's question timer
    const round = cache.rounds[cache.currentRoundIndex]
    const bonusTimerDurationMs = Math.floor((round?.timerSeconds ?? 30) / 2) * 1000
    const bonusTimerStartTime = Date.now()
    tb.bonusTimerStartTime = bonusTimerStartTime
    tb.bonusTimerDurationMs = bonusTimerDurationMs

    // Schedule server-side elapsed event — clients disable their submit button on receipt
    const bonusTeamIdForTimer = tb.bonusBuzzTeamId
    tb.bonusTimerHandle = setTimeout(() => {
      tb.bonusTimerHandle = null
      if (cache.status !== SessionStatus.BONUS_ANSWERING) return
      this.server
        .to(`session:${sessionId}`)
        .emit(SERVER_EVENTS.TILEBLITZ_BONUS_TIMER_ELAPSED, { bonusTeamId: bonusTeamIdForTimer })
    }, bonusTimerDurationMs)

    cache.status = SessionStatus.BONUS_ANSWERING

    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'bonus_answering' } })
      .catch(() => undefined)

    // Open an answer window for the bonus team — same question
    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
    // Let all clients know the bonus team now has permission (includes timer data)
    this.server.to(`session:${sessionId}`).emit('tileblitz:bonus:granted', {
      bonusTeamId: tb.bonusBuzzTeamId,
      questionId: question?.id,
      bonusTimerStartTime,
      bonusTimerDurationMs,
    })
  }

  // ─── Tile Blitz: reveal bonus answer ─────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_BONUS_REVEAL)
  async handleTileBlitzBonusReveal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.BONUS_ANSWERING) return

    const tb = cache.tileBlitz
    if (!tb || !tb.bonusBuzzTeamId) return

    // Cancel bonus timer if it hasn't fired yet (moderator revealed before time ran out)
    if (tb.bonusTimerHandle) {
      clearTimeout(tb.bonusTimerHandle)
      tb.bonusTimerHandle = null
    }
    tb.bonusTimerStartTime = null
    tb.bonusTimerDurationMs = null

    const isEndOfFlow = (tb?.turnsCompleted ?? 0) + 1 >= (tb?.totalTurns ?? 0)

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question) return

    const bonusTeamId = tb.bonusBuzzTeamId
    const submittedAnswer = tb.pendingAnswer ?? ''
    const validation = tileBlitzMode.validateAnswer(submittedAnswer, question)
    const pointsEarned = validation.correct ? tb.bonusPointsPerQuestion : 0

    const td = cache.teamScores.get(bonusTeamId)
    if (td && validation.correct) {
      td.score += pointsEarned
      if (cache.currentRoundId) {
        td.roundScores[cache.currentRoundId] =
          (td.roundScores[cache.currentRoundId] ?? 0) + pointsEarned
      }
      void this.prisma.sessionTeam
        .updateMany({ where: { teamId: bonusTeamId, sessionId }, data: { score: td.score } })
        .catch(() => undefined)
    }

    // Persist bonus answer to DB
    if (submittedAnswer) {
      void this.prisma.teamAnswer
        .create({
          data: {
            questionId: question.id,
            teamId: bonusTeamId,
            sessionId,
            submittedAnswer,
            isCorrect: validation.correct,
            pointsEarned,
            timeRemaining: 0,
          },
        })
        .catch(() => undefined)
    }

    cache.status = SessionStatus.BONUS_REVEAL
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'bonus_reveal' } })
      .catch(() => undefined)

    // Mark question as revealed so it won't be reused
    void this.prisma.question
      .update({ where: { id: question.id }, data: { status: 'revealed' } })
      .catch(() => undefined)

    const bonusTeamScore = cache.teamScores.get(bonusTeamId)
    const scores = this.scoresArray(cache)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.TILEBLITZ_BONUS_RESULT, {
      teamId: bonusTeamId,
      teamName: bonusTeamScore?.teamName ?? bonusTeamId,
      teamColor: bonusTeamScore?.teamColor ?? '#888',
      submittedAnswer,
      isCorrect: validation.correct,
      pointsEarned,
      correctAnswer: question.correctAnswer,
      scores,
    })

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SCORES_UPDATE, { scores })

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))

    if (isEndOfFlow) {
      cache.status = SessionStatus.QUESTION_SUMMARY
      void this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'question_summary' },
      })
      this.server
        .to(`session:${sessionId}:moderator`)
        .emit('round:ready:summary', { sessionId, roundId: cache.currentRoundId })
    }
  }

  // ─── Tile Blitz: next turn ────────────────────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.TILEBLITZ_NEXT_TURN)
  async handleTileBlitzNextTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (
      !cache ||
      (cache.status !== SessionStatus.ANSWER_REVEAL &&
        cache.status !== SessionStatus.BONUS_REVEAL &&
        cache.status !== SessionStatus.BONUS_OPEN)
    )
      return

    const tb = cache.tileBlitz
    if (!tb) return

    // Mark current tile as used
    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (question) {
      const tile = tb.tileStates.find((t) => t.questionId === question.id)
      if (tile) tile.used = true
    }

    tb.turnsCompleted++
    // Advance to next team in rotation
    tb.currentTurnIndex = (tb.currentTurnIndex + 1) % tb.turnOrderTeamIds.length
    tb.bonusBuzzTeamId = null
    tb.bonusGranted = false
    tb.pendingAnswer = null
    // Cancel any active bonus timer
    if (tb.bonusTimerHandle) {
      clearTimeout(tb.bonusTimerHandle)
      tb.bonusTimerHandle = null
    }
    tb.bonusTimerStartTime = null
    tb.bonusTimerDurationMs = null

    // Round ends when all teams have completed their required turns
    const roundDone = tb.turnsCompleted >= tb.totalTurns
    if (roundDone) {
      // this is already handled in bonus and answer reveal
      // Round complete
      // cache.status = SessionStatus.QUESTION_SUMMARY
      // void this.prisma.session.update({
      //   where: { id: sessionId },
      //   data: { status: 'question_summary' },
      // })
      // this.server
      //   .to(`session:${sessionId}:moderator`)
      //   .emit('round:ready:summary', { sessionId, roundId: cache.currentRoundId })
    } else {
      await this.enterTileSelect(sessionId, cache)
    }
  }

  // ─── Tile Blitz: handle bonus answer submission ───────────────────────────────
  // Reuses team:answer:submit with status BONUS_ANSWERING; gateway routes it here.
  // The bonus-team's submission is stored as pendingAnswer in tileBlitz state.

  // ─── Ultimate Challenge: select active team ───────────────────────────────────

  // @SubscribeMessage(MODERATOR_EVENTS.UC_SELECT_TEAM)
  // async handleUCSelectTeam(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: { sessionId: string; teamId: string },
  // ): Promise<void> {
  //   if (!this.isModerator(client)) return
  //   const { sessionId, teamId } = payload ?? {}
  //   const cache = activeSessions.get(sessionId)
  //   if (!cache || cache.status !== SessionStatus.UC_TEAM_SELECT) return

  //   const uc = cache.ultimateChallenge
  //   if (!uc) return

  //   if (uc.teamsCompleted.has(teamId)) {
  //     client.emit(SERVER_EVENTS.ERROR, {
  //       code: 'TEAM_ALREADY_PLAYED',
  //       message: 'This team has already had their turn',
  //     })
  //     return
  //   }

  //   const round = cache.rounds[cache.currentRoundIndex]
  //   const durationMs = (round?.timerSeconds ?? GAME_CONSTANTS.UC_DEFAULT_TIMER_SECONDS) * 1000

  //   // Build fresh question queue from pre-loaded questions
  //   uc.activeTeamId = teamId
  //   uc.questionQueue = cache.currentRoundQuestions.map((q) => q.id)
  //   uc.correctCount = 0
  //   uc.timerDeadline = Date.now() + durationMs

  //   if (uc.timerHandle) clearTimeout(uc.timerHandle)
  //   uc.timerHandle = setTimeout(() => void this.onUCTimerElapsed(sessionId), durationMs)

  //   cache.status = SessionStatus.UC_ACTIVE
  //   void this.prisma.session
  //     .update({ where: { id: sessionId }, data: { status: 'uc_active' } })
  //     .catch(() => undefined)

  //   this.server
  //     .to(`session:${sessionId}`)
  //     .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  // }
  @SubscribeMessage(MODERATOR_EVENTS.UC_SELECT_TEAM)
  async handleUCSelectTeam(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; teamId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return

    const { sessionId, teamId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.UC_TEAM_SELECT) return

    const uc = cache.ultimateChallenge
    if (!uc) return

    // ❌ Prevent replaying finished teams
    if (uc.teamsCompleted.has(teamId)) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'TEAM_ALREADY_PLAYED',
        message: 'This team has already completed their turn',
      })
      return
    }

    // ❌ Ensure team actually has a queue
    const queue = uc.teamQueues.get(teamId)
    if (!queue || queue.length === 0) {
      client.emit(SERVER_EVENTS.ERROR, {
        code: 'TEAM_HAS_NO_QUESTIONS',
        message: 'This team has no questions remaining',
      })
      return
    }

    const round = cache.rounds[cache.currentRoundIndex]
    const durationMs = (round?.timerSeconds ?? GAME_CONSTANTS.UC_DEFAULT_TIMER_SECONDS) * 1000

    // 🎯 Activate team (DO NOT rebuild queue)
    uc.activeTeamId = teamId

    // ⏱ Start timer
    uc.timerDeadline = Date.now() + durationMs

    if (uc.timerHandle) clearTimeout(uc.timerHandle)
    uc.timerHandle = setTimeout(() => void this.onUCTimerElapsed(sessionId), durationMs)

    // 🚦 Update session state
    cache.status = SessionStatus.UC_ACTIVE

    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'uc_active' },
      })
      .catch(() => undefined)

    // 📡 Emit state (buildUCState will pick queue[0] automatically)
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  }

  // ─── Ultimate Challenge: mark current question correct ────────────────────────

  // async handleUCMarkCorrect(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: { sessionId: string },
  // ): Promise<void> {
  //   if (!this.isModerator(client)) return
  //   const { sessionId } = payload ?? {}
  //   const cache = activeSessions.get(sessionId)
  //   if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return

  //   const uc = cache.ultimateChallenge
  //   if (!uc || !uc.activeTeamId || uc.questionQueue.length === 0) return

  //   const questionId = uc.questionQueue[0]
  //   const question = cache.currentRoundQuestions.find((q) => q.id === questionId)
  //   if (!question) return

  //   const round = cache.rounds[cache.currentRoundIndex]
  //   const points = round?.pointsPerQuestion ?? GAME_CONSTANTS.UC_DEFAULT_POINTS_PER_CORRECT

  //   // Award points immediately and update in-memory score
  //   const td = cache.teamScores.get(uc.activeTeamId)
  //   if (td) {
  //     td.score += points
  //     if (cache.currentRoundId) {
  //       td.roundScores[cache.currentRoundId] = (td.roundScores[cache.currentRoundId] ?? 0) + points
  //     }
  //   }

  //   uc.correctCount++
  //   // Remove the correct question from the queue
  //   uc.questionQueue = uc.questionQueue.slice(1)

  //   const scores = this.scoresArray(cache)
  //   const nextQuestion = uc.questionQueue[0]
  //     ? (cache.currentRoundQuestions.find((q) => q.id === uc.questionQueue[0]) ?? null)
  //     : null

  //   this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.UC_QUESTION_UPDATE, {
  //     type: 'correct',
  //     questionId,
  //     correctCount: uc.correctCount,
  //     pointsAwarded: points,
  //     nextQuestion: nextQuestion
  //       ? {
  //           id: nextQuestion.id,
  //           text: nextQuestion.text,
  //           correctAnswer: nextQuestion.correctAnswer,
  //         }
  //       : null,
  //     queueLength: uc.questionQueue.length,
  //     scores,
  //   })

  //   // If all questions answered correctly, end the team's turn immediately
  //   if (uc.questionQueue.length === 0) {
  //     await this.endUCTeamTurn(sessionId, cache, 'all_correct')
  //   }
  // }
  @SubscribeMessage(MODERATOR_EVENTS.UC_MARK_CORRECT)
  async handleUCMarkCorrect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return

    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return

    const uc = cache.ultimateChallenge
    if (!uc?.activeTeamId) return

    const teamId = uc.activeTeamId
    const queue = uc.teamQueues.get(teamId)

    if (!queue || queue.length === 0) return

    // const question = queue[0]

    const round = cache.rounds[cache.currentRoundIndex]
    const points = round?.pointsPerQuestion ?? GAME_CONSTANTS.UC_DEFAULT_POINTS_PER_CORRECT

    // 🧠 SCORE UPDATE
    const td = cache.teamScores.get(teamId)
    if (td) {
      td.score += points

      if (cache.currentRoundId) {
        td.roundScores[cache.currentRoundId] = (td.roundScores[cache.currentRoundId] ?? 0) + points
      }
    }

    // 📉 REMOVE QUESTION (core mechanic)
    queue.shift()

    // 🧠 mark completion if empty
    if (queue.length === 0) {
      uc.teamsCompleted.add(teamId)
    }

    // const nextQuestion = queue[0] ?? null
    const isQueueEmpty = queue.length === 0

    // 🧠 AUTO END TURN IF TEAM FINISHED
    // endUCTeamTurn already emits UC_STATE internally, so return early to avoid a second emit
    if (isQueueEmpty) {
      await this.endUCTeamTurn(sessionId, cache, 'all_correct')
      return
    }

    // 📡 FULL STATE SYNC — only reached when more questions remain
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  }

  // ─── Ultimate Challenge: skip current question ────────────────────────────────

  // @SubscribeMessage(MODERATOR_EVENTS.UC_SKIP)
  // handleUCSkip(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: { sessionId: string },
  // ): void {
  //   if (!this.isModerator(client)) return
  //   const { sessionId } = payload ?? {}
  //   const cache = activeSessions.get(sessionId)
  //   if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return

  //   const uc = cache.ultimateChallenge
  //   if (!uc || uc.questionQueue.length === 0) return

  //   // Move current question to end of queue
  //   const [current, ...rest] = uc.questionQueue
  //   uc.questionQueue = [...rest, current]

  //   const nextQuestion = uc.questionQueue[0]
  //     ? (cache.currentRoundQuestions.find((q) => q.id === uc.questionQueue[0]) ?? null)
  //     : null

  //   this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.UC_QUESTION_UPDATE, {
  //     type: 'skip',
  //     questionId: current,
  //     correctCount: uc.correctCount,
  //     pointsAwarded: 0,
  //     nextQuestion: nextQuestion
  //       ? {
  //           id: nextQuestion.id,
  //           text: nextQuestion.text,
  //           correctAnswer: nextQuestion.correctAnswer,
  //         }
  //       : null,
  //     queueLength: uc.questionQueue.length,
  //     scores: this.scoresArray(cache),
  //   })
  // }

  @SubscribeMessage(MODERATOR_EVENTS.UC_SKIP)
  handleUCSkip(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return

    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return

    const uc = cache.ultimateChallenge
    if (!uc?.activeTeamId) return

    const teamId = uc.activeTeamId
    const queue = uc.teamQueues.get(teamId)

    if (!queue || queue.length === 0) return

    // 🧠 current question
    // const current = queue[0]

    // 🔁 move to back of queue (circular logic)
    queue.push(queue.shift()!)

    // const nextQuestion = queue[0] ?? null

    // 📡 lightweight event (optional UX feedback)
    // this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.UC_ACTION, {
    //   type: 'skip',
    //   teamId,
    //   questionId: current.id,
    // })

    // 📡 FULL STATE SYNC (IMPORTANT)
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  }

  // ─── Ultimate Challenge: force end active team's turn ─────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.UC_END_TURN)
  async handleUCEndTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return
    await this.endUCTeamTurn(sessionId, cache, 'manual')
  }

  // ─── Clue Reveal: team buzz-in ───────────────────────────────────────────────

  @SubscribeMessage(TEAM_EVENTS.CLUE_BUZZ)
  handleClueBuzz(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { teamId: string; sessionId: string },
  ): void {
    const { teamId, sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.CLUE_OPEN) return

    const cr = cache.clueReveal
    if (!cr) return
    if (cr.buzzingTeamId) return // someone already buzzed
    if (cr.lockedTeamIds.has(teamId)) return // this team is locked out

    // Task 2: Disable buzzing after clue timer elapses
    if (cr.clueTimerDeadline > 0 && Date.now() > cr.clueTimerDeadline) return

    cr.buzzingTeamId = teamId

    // Stop the clue timer — buzzing team now has time to answer
    if (cr.clueTimerHandle) {
      clearTimeout(cr.clueTimerHandle)
      cr.clueTimerHandle = null
    }

    cache.status = SessionStatus.CLUE_ANSWERING
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'clue_answering' } })
      .catch(() => undefined)

    // THE TWIST: Start answering timer (half of clue timer duration)
    const round = cache.rounds[cache.currentRoundIndex]
    const clueSeconds = round?.timerSeconds ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS
    const answeringDurationMs = Math.floor(clueSeconds / 2) * 1000
    cr.answeringTimerDeadline = Date.now() + answeringDurationMs

    if (cr.answeringTimerHandle) clearTimeout(cr.answeringTimerHandle)
    cr.answeringTimerHandle = setTimeout(
      () => void this.handleClueAnsweringTimeout(sessionId),
      answeringDurationMs,
    )

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.CLUE_STATE, this.buildClueState(sessionId, cache))
  }

  // ─── Clue Reveal: moderator reveal next clue ─────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.CLUE_REVEAL_NEXT)
  handleClueRevealNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.CLUE_OPEN) return

    const cr = cache.clueReveal
    if (!cr) return

    const nextIndex = cr.currentClueIndex + 1
    if (nextIndex >= cr.clues.length) {
      // All clues exhausted — lock with no answer
      this.lockClueQuestion(sessionId, cache)
      return
    }

    // Clear existing clue timer
    if (cr.clueTimerHandle) {
      clearTimeout(cr.clueTimerHandle)
      cr.clueTimerHandle = null
    }

    cr.currentClueIndex = nextIndex
    const round = cache.rounds[cache.currentRoundIndex]
    cr.pointsAvailable = Math.max(
      GAME_CONSTANTS.CLUE_REVEAL_MIN_POINTS,
      (round?.pointsPerQuestion ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_POINTS) -
        nextIndex * GAME_CONSTANTS.CLUE_REVEAL_PENALTY_PER_CLUE,
    )
    cr.buzzingTeamId = null // reset buzz state for new clue

    // Clear answering timer if moderator forces next clue
    if (cr.answeringTimerHandle) {
      clearTimeout(cr.answeringTimerHandle)
      cr.answeringTimerHandle = null
    }
    cr.answeringTimerDeadline = 0

    const timerMs =
      (round?.timerSeconds ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS) * 1000
    cr.clueTimerDeadline = Date.now() + timerMs
    cr.clueTimerHandle = setTimeout(() => void this.onClueTimerElapsed(sessionId), timerMs)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLUE_NEXT, {
      clueIndex: cr.currentClueIndex,
      clueText: cr.clues[cr.currentClueIndex] ?? '',
      pointsAvailable: cr.pointsAvailable,
      timerDeadline: cr.clueTimerDeadline,
    })
  }

  // ─── Clue Reveal: moderator skip question ────────────────────────────────────

  @SubscribeMessage(MODERATOR_EVENTS.CLUE_SKIP)
  handleClueSkip(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    if (!this.isModerator(client)) return
    const { sessionId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.CLUE_OPEN) return
    this.lockClueQuestion(sessionId, cache)
  }

  // ─── Audience: round vote ─────────────────────────────────────────────────────

  @SubscribeMessage(AUDIENCE_EVENTS.VOTE_SUBMIT)
  handleAudienceVote(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    payload: {
      audienceId: string
      sessionId: string
      roundId: string
      predictedRanking: string[]
    },
  ): void {
    const { audienceId, sessionId, roundId, predictedRanking } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.AUDIENCE_VOTE) return

    void this.prisma.audienceRoundPrediction
      .create({
        data: {
          audienceMemberId: audienceId,
          sessionId,
          roundId,
          predictedRanking: JSON.stringify(predictedRanking),
        },
      })
      .catch(() => undefined)

    // Tally — count each #1 pick for the live race-bar, plus per-position breakdown
    const firstPick = predictedRanking[0]
    if (firstPick) {
      cache.audienceVoteTally[firstPick] = (cache.audienceVoteTally[firstPick] ?? 0) + 1
    }

    // Track full position breakdown: for each team, how many ranked them at each position
    predictedRanking.forEach((teamId, idx) => {
      if (!cache.audienceVotePositionTally[teamId]) cache.audienceVotePositionTally[teamId] = {}
      const pos = idx + 1
      cache.audienceVotePositionTally[teamId][pos] = (cache.audienceVotePositionTally[teamId][pos] ?? 0) + 1
    })

    // Throttled broadcast: coalesce rapid submissions into at most one update per 400 ms.
    // The actual tally is already updated in-memory above; the broadcast just sends the snapshot.
    const existingTimer = voteThrottleTimers.get(sessionId)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      voteThrottleTimers.delete(sessionId)
      const totalVotes = Object.values(cache.audienceVoteTally).reduce((s, v) => s + v, 0)
      this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.ROUND_VOTE_UPDATE, {
        tally: cache.audienceVoteTally,
        positionTally: cache.audienceVotePositionTally,
        totalVotes,
      })
    }, 400)
    voteThrottleTimers.set(sessionId, timer)
  }

  // ─── Audience: per-question prediction ───────────────────────────────────────

  @SubscribeMessage(AUDIENCE_EVENTS.PREDICT_SUBMIT)
  handleAudiencePredict(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    payload: {
      audienceId: string
      sessionId: string
      questionId: string
      predictedTeamId: string
    },
  ): void {
    const { audienceId, sessionId, predictedTeamId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || !cache.activeInteraction) return
    if (cache.activeInteraction.type !== AudienceInteractionType.PREDICTION) return
    if (cache.activeInteraction.submissions.has(audienceId)) return

    cache.activeInteraction.submissions.set(audienceId, { predictedTeamId })
    cache.activeInteraction.totalSubmissions++
    cache.activeInteraction.tally[predictedTeamId] =
      (cache.activeInteraction.tally[predictedTeamId] ?? 0) + 1

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.AUDIENCE_INTERACTION_UPDATE, {
      tally: cache.activeInteraction.tally,
      totalSubmissions: cache.activeInteraction.totalSubmissions,
    })
  }

  @SubscribeMessage(AUDIENCE_EVENTS.GHOST_ANSWER_SUBMIT)
  handleAudienceGhostAnswer(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    payload: {
      audienceId: string
      sessionId: string
      questionId: string
      answer: string
    },
  ): void {
    const { audienceId, sessionId, answer } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache || !cache.activeInteraction) return
    if (cache.activeInteraction.type !== AudienceInteractionType.GHOST_ANSWER) return
    if (cache.activeInteraction.submissions.has(audienceId)) return

    cache.activeInteraction.submissions.set(audienceId, { answer })
    cache.activeInteraction.totalSubmissions++

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.AUDIENCE_INTERACTION_UPDATE, {
      totalSubmissions: cache.activeInteraction.totalSubmissions,
    })
  }

  // ─── Audience: emoji reaction ─────────────────────────────────────────────────

  // Server-side emoji rate limiter: one event per 1.5 s per audience member.
  private readonly emojiLastSent = new Map<string, number>()
  private readonly EMOJI_COOLDOWN_MS = 1500

  @SubscribeMessage(AUDIENCE_EVENTS.REACT)
  handleAudienceReact(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { audienceId: string; sessionId: string; emoji: string },
  ): void {
    const { sessionId, emoji, audienceId } = payload ?? {}
    const cache = activeSessions.get(sessionId)
    if (!cache) return

    const now = Date.now()
    const last = this.emojiLastSent.get(audienceId) ?? 0
    if (now - last < this.EMOJI_COOLDOWN_MS) return
    this.emojiLastSent.set(audienceId, now)

    cache.audienceEmojiCount[emoji] = (cache.audienceEmojiCount[emoji] ?? 0) + 1

    // Broadcast to projector screen only
    this.server.to(`session:${sessionId}:screen`).emit(AUDIENCE_EVENTS.REACT, {
      emoji,
      audienceId,
      count: cache.audienceEmojiCount,
    })
  }

  // ─── Private: timer logic ─────────────────────────────────────────────────────

  private async openNextQuestion(sessionId: string, cache: SessionCache): Promise<void> {
    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question) return

    const round = cache.rounds[cache.currentRoundIndex]
    const durationMs = (round?.timerSeconds ?? GAME_CONSTANTS.BLITZ_DEFAULT_TIMER_SECONDS) * 1000

    const startTime = Date.now()
    cache.questionStartTime = startTime
    cache.timerDeadline = startTime + durationMs
    cache.timerDurationMs = durationMs
    cache.submittedTeams = new Set()
    cache.status = SessionStatus.QUESTION_OPEN
    cache.pausedAt = null
    cache.remainingMsAtPause = null

    // Clear any leftover handle from previous question
    if (cache.questionTimerHandle) {
      clearTimeout(cache.questionTimerHandle)
    }
    cache.questionTimerHandle = setTimeout(() => void this.onTimerElapsed(sessionId), durationMs)

    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'question_open', currentQuestionId: question.id },
      })
      .catch(() => undefined)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLOCK_SYNC, { serverTime: Date.now() })
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.QUESTION_OPEN, {
      questionId: question.id,
      question,
      startTime,
      durationMs,
      questionIndex: cache.currentQuestionIndex,
      totalQuestions: cache.currentRoundQuestions.length,
    })

    // Audience Engagement
    this.checkAndTriggerAudienceActivity(sessionId, cache)
  }

  private async onTimerElapsed(sessionId: string): Promise<void> {
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.QUESTION_OPEN) return

    cache.questionTimerHandle = null

    const round = cache.rounds[cache.currentRoundIndex]
    if (round?.gameMode === 'tile_blitz') {
      await this.lockTileBlitzQuestion(sessionId, cache)
    } else if (round?.gameMode === 'ultimate_challenge') {
      await this.onUCTimerElapsed(sessionId)
    } else {
      this.lockQuestion(sessionId, cache)
    }

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.QUESTION_TIMER_ELAPSED, {
      sessionId,
      questionId: cache.currentRoundQuestions[cache.currentQuestionIndex]?.id ?? null,
    })
  }

  private lockQuestion(sessionId: string, cache: SessionCache): void {
    if (cache.status !== SessionStatus.QUESTION_OPEN) return
    cache.status = SessionStatus.QUESTION_LOCKED
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'question_locked' } })
      .catch(() => undefined)

    // Audience Engagement
    this.closeAudienceInteraction(sessionId, cache)
  }

  // ─── Ultimate Challenge helpers ───────────────────────────────────────────────

  // private async enterUCTeamSelect(sessionId: string, cache: SessionCache): Promise<void> {
  //   const uc = cache.ultimateChallenge
  //   if (!uc) return

  //   uc.activeTeamId = null
  //   uc.questionQueue = []
  //   uc.correctCount = 0
  //   uc.timerDeadline = 0
  //   if (uc.timerHandle) {
  //     clearTimeout(uc.timerHandle)
  //     uc.timerHandle = null
  //   }

  //   cache.status = SessionStatus.UC_TEAM_SELECT
  //   void this.prisma.session
  //     .update({ where: { id: sessionId }, data: { status: 'uc_team_select' } })
  //     .catch(() => undefined)

  //   this.server
  //     .to(`session:${sessionId}`)
  //     .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  // }

  private async enterUCTeamSelect(sessionId: string, cache: SessionCache): Promise<void> {
    const uc = cache.ultimateChallenge
    if (!uc) return

    // 🧠 We are ONLY pausing active play, not resetting game state
    uc.activeTeamId = null

    // ⏱ Stop any running timer
    uc.timerDeadline = 0
    if (uc.timerHandle) {
      clearTimeout(uc.timerHandle)
      uc.timerHandle = null
    }

    // 🚦 Move session into team selection state
    cache.status = SessionStatus.UC_TEAM_SELECT

    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'uc_team_select' },
      })
      .catch(() => undefined)

    // 📡 Emit updated state to UI
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))
  }

  private async onUCTimerElapsed(sessionId: string): Promise<void> {
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.UC_ACTIVE) return
    await this.endUCTeamTurn(sessionId, cache, 'timer')
  }

  // private async endUCTeamTurn(
  //   sessionId: string,
  //   cache: SessionCache,
  //   _reason: 'timer' | 'all_correct' | 'manual',
  // ): Promise<void> {
  //   const uc = cache.ultimateChallenge
  //   if (!uc || !uc.activeTeamId) return

  //   // Clear timer if it's still running
  //   if (uc.timerHandle) {
  //     clearTimeout(uc.timerHandle)
  //     uc.timerHandle = null
  //   }

  //   const teamId = uc.activeTeamId
  //   uc.teamsCompleted.add(teamId)

  //   const td = cache.teamScores.get(teamId)
  //   const pointsEarned =
  //     uc.correctCount *
  //     (cache.rounds[cache.currentRoundIndex]?.pointsPerQuestion ??
  //       GAME_CONSTANTS.UC_DEFAULT_POINTS_PER_CORRECT)

  //   // Persist score to DB
  //   if (td) {
  //     void this.prisma.sessionTeam
  //       .updateMany({
  //         where: { teamId, sessionId },
  //         data: { score: td.score, roundScores: JSON.stringify(td.roundScores) },
  //       })
  //       .catch(() => undefined)
  //   }

  //   const teamsRemaining = uc.teamOrder.filter((id) => !uc.teamsCompleted.has(id))
  //   const isLastTeam = teamsRemaining.length === 0

  //   this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.UC_TEAM_DONE, {
  //     teamId,
  //     teamName: td?.teamName ?? teamId,
  //     teamColor: td?.teamColor ?? '#888',
  //     correctCount: uc.correctCount,
  //     pointsEarned,
  //     isLastTeam,
  //   })

  //   this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SCORES_UPDATE, {
  //     scores: this.scoresArray(cache),
  //   })

  //   if (isLastTeam) {
  //     // All teams done — advance to round summary
  //     cache.status = SessionStatus.QUESTION_SUMMARY
  //     void this.prisma.session
  //       .update({ where: { id: sessionId }, data: { status: 'question_summary' } })
  //       .catch(() => undefined)
  //     this.server
  //       .to(`session:${sessionId}:moderator`)
  //       .emit('round:ready:summary', { sessionId, roundId: cache.currentRoundId })
  //   } else {
  //     await this.enterUCTeamSelect(sessionId, cache)
  //   }
  // }

  private async endUCTeamTurn(
    sessionId: string,
    cache: SessionCache,
    _reason: 'timer' | 'all_correct' | 'manual',
  ): Promise<void> {
    const uc = cache.ultimateChallenge
    if (!uc || !uc.activeTeamId) return

    // ⏱ Clear timer
    if (uc.timerHandle) {
      clearTimeout(uc.timerHandle)
      uc.timerHandle = null
    }

    const teamId = uc.activeTeamId
    const queue = uc.teamQueues.get(teamId) ?? []

    const td = cache.teamScores.get(teamId)

    // 🧠 Correct + skip already mutated queue
    const initialSize = uc.initialQueueSizes.get(teamId) ?? 0
    const remaining = queue.length

    // 📊 derive correct answers (NOT stored globally anymore)
    const correctCount = initialSize - remaining

    const pointsPerQ =
      cache.rounds[cache.currentRoundIndex]?.pointsPerQuestion ??
      GAME_CONSTANTS.UC_DEFAULT_POINTS_PER_CORRECT

    const pointsEarned = correctCount * pointsPerQ

    // 💾 persist score
    if (td) {
      void this.prisma.sessionTeam
        .updateMany({
          where: { teamId, sessionId },
          data: {
            score: td.score,
            roundScores: JSON.stringify(td.roundScores),
          },
        })
        .catch(() => undefined)
    }

    // 🧠 mark completion if not already
    uc.teamsCompleted.add(teamId)

    // 📡 emit team finished
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.UC_TEAM_DONE, {
      teamId,
      teamName: td?.teamName ?? teamId,
      teamColor: td?.teamColor ?? '#888',

      correctCount,
      pointsEarned,

      isLastTeam: false, // computed below
    })

    // 📡 scores update
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SCORES_UPDATE, {
      scores: this.scoresArray(cache),
    })

    // 🧠 reset active state
    uc.activeTeamId = null
    uc.timerDeadline = 0

    const isLastTeam = uc.teamQueues.size > 0 && uc.teamsCompleted.size >= uc.teamQueues.size
    if (isLastTeam) {
      // 🏁 ROUND COMPLETE
      cache.status = SessionStatus.QUESTION_SUMMARY
      // 📡 sync UI state immediately
      this.server
        .to(`session:${sessionId}`)
        .emit(SERVER_EVENTS.UC_STATE, this.buildUCState(sessionId, cache))

      void this.prisma.session
        .update({
          where: { id: sessionId },
          data: { status: 'question_summary' },
        })
        .catch(() => undefined)
    } else {
      // 🔁 go back to selection phase
      await this.enterUCTeamSelect(sessionId, cache)
    }
  }

  private buildUCState(sessionId: string, cache: SessionCache): object {
    const uc = cache.ultimateChallenge
    if (!uc) return {}

    const activeTeamId = uc.activeTeamId

    // 🧠 ACTIVE QUESTION = queue[0] of active team
    const activeQueue = activeTeamId ? (uc.teamQueues.get(activeTeamId) ?? []) : []

    const currentQuestion = activeQueue[0] ?? null

    const allTeamIds = Array.from(cache.teamScores.keys())

    // 📊 UNIFIED TEAM STATE (REPLACES teamsDone + teamsRemaining)
    const teams = allTeamIds.map((id) => {
      const td = cache.teamScores.get(id)
      const queue = uc.teamQueues.get(id) ?? []
      const initial = uc.initialQueueSizes.get(id) ?? 0

      const isCompleted = uc.teamsCompleted.has(id) || queue.length === 0
      const isActive = id === uc.activeTeamId

      return {
        teamId: id,
        teamName: td?.teamName ?? id,
        teamColor: td?.teamColor ?? '#888',

        // 📊 queue-based progress (core model)
        remaining: queue.length,
        total: initial,
        progress: initial > 0 ? (initial - queue.length) / initial : 0,

        // 🧠 state flags
        isActive,
        isCompleted,

        // 🏆 score
        score: td?.score ?? 0,
      }
    })

    const activeTd = activeTeamId ? cache.teamScores.get(activeTeamId) : null

    return {
      sessionId,

      // 🎯 active control
      activeTeamId,
      activeTeamName: activeTd?.teamName ?? null,
      activeTeamColor: activeTd?.teamColor ?? null,

      // 🧠 current question (derived from queue[0])
      currentQuestion: currentQuestion
        ? {
            id: currentQuestion.id,
            text: currentQuestion.text,
            correctAnswer: currentQuestion.correctAnswer,
          }
        : null,

      // ⏱ timer
      timerDeadline: uc.timerDeadline,

      // 📊 unified team state
      teams,

      status: cache.status,

      // 🏆 scores (optional redundancy, can remove later if teams fully replaces it)
      scores: this.scoresArray(cache),
    }
  }

  // ─── Tile Blitz helpers ───────────────────────────────────────────────────────

  private async enterTileSelect(sessionId: string, cache: SessionCache): Promise<void> {
    const tb = cache.tileBlitz
    if (!tb) return

    cache.status = SessionStatus.TILE_SELECT
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'tile_select' } })
      .catch(() => undefined)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.TILEBLITZ_STATE, this.buildTileBlitzState(tb, cache))
  }

  private async lockTileBlitzQuestion(sessionId: string, cache: SessionCache): Promise<void> {
    const tb = cache.tileBlitz
    if (!tb) return

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question) return

    const round = cache.rounds[cache.currentRoundIndex]
    const submittedAnswer = tb.pendingAnswer ?? ''
    const validation = tileBlitzMode.validateAnswer(submittedAnswer, question)
    const pointsEarned = validation.correct ? (round?.pointsPerQuestion ?? 0) : 0

    const activeTeamId = tb.turnOrderTeamIds[tb.currentTurnIndex]
    const td = cache.teamScores.get(activeTeamId)
    if (td && validation.correct) {
      td.score += pointsEarned
      if (cache.currentRoundId) {
        td.roundScores[cache.currentRoundId] =
          (td.roundScores[cache.currentRoundId] ?? 0) + pointsEarned
      }
      if (validation.correct)
        td.correctAnswerTimeMs += Math.max(0, cache.timerDeadline - Date.now())
    }

    // Persist answer to DB
    void this.prisma
      .$transaction([
        this.prisma.teamAnswer.create({
          data: {
            questionId: question.id,
            teamId: activeTeamId,
            sessionId,
            submittedAnswer,
            isCorrect: validation.correct,
            pointsEarned,
            timeRemaining: Math.max(0, cache.timerDeadline - Date.now()),
          },
        }),
        ...(td
          ? [
              this.prisma.sessionTeam.updateMany({
                where: { teamId: activeTeamId, sessionId },
                data: { score: td.score },
              }),
            ]
          : []),
      ])
      .catch(() => undefined)

    cache.status = SessionStatus.QUESTION_LOCKED
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'question_locked' } })
      .catch(() => undefined)

    this.closeAudienceInteraction(sessionId, cache)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
  }

  private buildTileBlitzState(
    tb: import('./session-cache').TileBlitzState,
    cache: SessionCache,
  ): object {
    const activeTeamId = tb.turnOrderTeamIds[tb.currentTurnIndex]
    return {
      tiles: tb.tileStates,
      turnOrderTeamIds: tb.turnOrderTeamIds,
      currentTurnIndex: tb.currentTurnIndex,
      activeTeamId,
      turnsCompleted: tb.turnsCompleted,
      totalTurns: tb.totalTurns,
      bonusBuzzTeamId: tb.bonusBuzzTeamId,
      bonusGranted: tb.bonusGranted,
      scores: this.scoresArray(cache),
    }
  }

  // ─── Clue Reveal helpers ─────────────────────────────────────────────────────

  private async openClueRevealQuestion(sessionId: string, cache: SessionCache): Promise<void> {
    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question) return

    const round = cache.rounds[cache.currentRoundIndex]
    const clues: string[] = question.clues ?? []

    const cr = cache.clueReveal
    if (!cr) return

    cr.clues = clues
    cr.currentClueIndex = 0
    cr.pointsAvailable = round?.pointsPerQuestion ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_POINTS
    cr.lockedTeamIds = new Set()
    cr.buzzingTeamId = null

    if (cr.clueTimerHandle) {
      clearTimeout(cr.clueTimerHandle)
      cr.clueTimerHandle = null
    }
    if (cr.answeringTimerHandle) {
      clearTimeout(cr.answeringTimerHandle)
      cr.answeringTimerHandle = null
    }
    cr.answeringTimerDeadline = 0

    const timerMs =
      (round?.timerSeconds ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS) * 1000
    cr.clueTimerDeadline = Date.now() + timerMs
    cr.clueTimerHandle = setTimeout(() => void this.onClueTimerElapsed(sessionId), timerMs)

    cache.status = SessionStatus.CLUE_OPEN
    cache.submittedTeams = new Set()

    void this.prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'clue_open', currentQuestionId: question.id },
      })
      .catch(() => undefined)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.CLUE_STATE, this.buildClueState(sessionId, cache))

    // Audience Engagement
    this.checkAndTriggerAudienceActivity(sessionId, cache)
  }

  private async onClueTimerElapsed(sessionId: string): Promise<void> {
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.CLUE_OPEN) return

    const cr = cache.clueReveal
    if (!cr) return
    cr.clueTimerHandle = null

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLUE_TIMER_ELAPSED, {
      sessionId,
      clueIndex: cr.currentClueIndex,
    })
    // Moderator decides whether to reveal next clue or skip — no auto-advance
  }

  private lockClueQuestion(sessionId: string, cache: SessionCache): void {
    const cr = cache.clueReveal
    if (!cr) return

    if (cr.clueTimerHandle) {
      clearTimeout(cr.clueTimerHandle)
      cr.clueTimerHandle = null
    }
    if (cr.answeringTimerHandle) {
      clearTimeout(cr.answeringTimerHandle)
      cr.answeringTimerHandle = null
    }
    cr.buzzingTeamId = null

    cache.status = SessionStatus.QUESTION_LOCKED
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'question_locked' } })
      .catch(() => undefined)

    this.closeAudienceInteraction(sessionId, cache)

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.SESSION_STATE, this.buildStateSnapshot(sessionId))
  }

  private async handleClueAnswer(
    sessionId: string,
    cache: SessionCache,
    teamId: string,
    questionId: string,
    answer: string,
  ): Promise<void> {
    const cr = cache.clueReveal
    if (!cr) return

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    if (!question || question.id !== questionId) return

    const round = cache.rounds[cache.currentRoundIndex]
    const validation = clueRevealMode.validateAnswer(answer, question)
    const clueIndex = cr.currentClueIndex
    const pointsEarned = clueRevealMode.calculateScore({
      basePoints: round?.pointsPerQuestion ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_POINTS,
      timeRemainingMs: clueIndex, // clueIndex encoded into timeRemainingMs per design
      timerDurationMs: 0,
      isCorrect: validation.correct,
    })

    const td = cache.teamScores.get(teamId)
    if (validation.correct && td) {
      td.score += pointsEarned
      if (cache.currentRoundId) {
        td.roundScores[cache.currentRoundId] =
          (td.roundScores[cache.currentRoundId] ?? 0) + pointsEarned
      }
    }

    void this.prisma
      .$transaction([
        this.prisma.teamAnswer.create({
          data: {
            questionId,
            teamId,
            sessionId,
            submittedAnswer: answer,
            isCorrect: validation.correct,
            pointsEarned,
            timeRemaining: clueIndex,
          },
        }),
        ...(td
          ? [
              this.prisma.sessionTeam.updateMany({
                where: { teamId, sessionId },
                data: { score: td.score },
              }),
            ]
          : []),
      ])
      .catch(() => undefined)

    const teamScore = cache.teamScores.get(teamId)
    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLUE_ANSWER_RESULT, {
      teamId,
      teamName: teamScore?.teamName ?? teamId,
      teamColor: teamScore?.teamColor ?? '#888',
      isCorrect: validation.correct,
      submittedAnswer: answer,
      pointsEarned,
      clueIndex,
    })

    if (validation.correct) {
      // Correct — lock the question, moderator will reveal answer
      cr.buzzingTeamId = null
      if (cr.answeringTimerHandle) {
        clearTimeout(cr.answeringTimerHandle)
        cr.answeringTimerHandle = null
      }
      this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.SCORES_UPDATE, {
        scores: this.scoresArray(cache),
      })
      this.lockClueQuestion(sessionId, cache)
    } else {
      // Wrong — lock this team out and return to CLUE_OPEN so others can buzz
      cr.lockedTeamIds.add(teamId)
      cr.buzzingTeamId = null
      if (cr.answeringTimerHandle) {
        clearTimeout(cr.answeringTimerHandle)
        cr.answeringTimerHandle = null
      }

      // Task 1: If all teams are locked out, move to reveal/locked state
      const totalTeams = cache.teamScores.size
      if (cr.lockedTeamIds.size >= totalTeams) {
        this.lockClueQuestion(sessionId, cache)
        return
      }

      // Restart clue timer
      const timerMs =
        (round?.timerSeconds ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS) * 1000
      cr.clueTimerDeadline = Date.now() + timerMs
      if (cr.clueTimerHandle) clearTimeout(cr.clueTimerHandle)
      cr.clueTimerHandle = setTimeout(() => void this.onClueTimerElapsed(sessionId), timerMs)

      cache.status = SessionStatus.CLUE_OPEN
      void this.prisma.session
        .update({ where: { id: sessionId }, data: { status: 'clue_open' } })
        .catch(() => undefined)

      this.server
        .to(`session:${sessionId}`)
        .emit(SERVER_EVENTS.CLUE_STATE, this.buildClueState(sessionId, cache))
    }
  }

  private async handleClueAnsweringTimeout(sessionId: string): Promise<void> {
    const cache = activeSessions.get(sessionId)
    if (!cache || cache.status !== SessionStatus.CLUE_ANSWERING) return

    const cr = cache.clueReveal
    if (!cr || !cr.buzzingTeamId) return

    const teamId = cr.buzzingTeamId
    cr.answeringTimerHandle = null

    // Treat timeout as wrong answer: lock out for the whole question and restart clue timer
    cr.lockedTeamIds.add(teamId)
    cr.buzzingTeamId = null

    // Task 1: If all teams are locked out, move to reveal/locked state
    const totalTeams = cache.teamScores.size
    if (cr.lockedTeamIds.size >= totalTeams) {
      this.lockClueQuestion(sessionId, cache)
      return
    }

    const round = cache.rounds[cache.currentRoundIndex]
    const timerMs =
      (round?.timerSeconds ?? GAME_CONSTANTS.CLUE_REVEAL_DEFAULT_CLUE_TIMER_SECONDS) * 1000
    cr.clueTimerDeadline = Date.now() + timerMs
    if (cr.clueTimerHandle) clearTimeout(cr.clueTimerHandle)
    cr.clueTimerHandle = setTimeout(() => void this.onClueTimerElapsed(sessionId), timerMs)

    cache.status = SessionStatus.CLUE_OPEN
    void this.prisma.session
      .update({ where: { id: sessionId }, data: { status: 'clue_open' } })
      .catch(() => undefined)

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.CLUE_ANSWER_RESULT, {
      teamId,
      isCorrect: false,
      timeout: true,
      pointsEarned: 0,
    })

    this.server
      .to(`session:${sessionId}`)
      .emit(SERVER_EVENTS.CLUE_STATE, this.buildClueState(sessionId, cache))
  }

  private buildClueState(sessionId: string, cache: SessionCache): object {
    const cr = cache.clueReveal
    if (!cr) return {}

    const question = cache.currentRoundQuestions[cache.currentQuestionIndex]
    const buzzingTeamScore = cr.buzzingTeamId ? cache.teamScores.get(cr.buzzingTeamId) : null

    return {
      questionId: question?.id ?? null,
      correctAnswer: question?.correctAnswer ?? null,
      clues: cr.clues,
      currentClueIndex: cr.currentClueIndex,
      currentClueText: cr.clues[cr.currentClueIndex] ?? '',
      pointsAvailable: cr.pointsAvailable,
      lockedTeamIds: Array.from(cr.lockedTeamIds),
      buzzingTeamId: cr.buzzingTeamId,
      buzzingTeamName: buzzingTeamScore?.teamName ?? null,
      buzzingTeamColor: buzzingTeamScore?.teamColor ?? null,
      timerDeadline: cr.clueTimerDeadline,
      answeringTimerDeadline: cr.answeringTimerDeadline,
      questionIndex: cache.currentQuestionIndex,
      totalQuestions: cache.currentRoundQuestions.length,
      scores: this.scoresArray(cache),
      sessionId,
    }
  }

  // ─── Private: cache initialisation ────────────────────────────────────────────

  private async ensureCache(session: {
    id: string
    sessionCode?: string | null
    quizId: string
    status: string
    audienceMembers: Array<{ id: string }>
    sessionTeams: Array<{
      id: string
      teamId: string
      score: number
      roundScores: string
      connected: boolean
      team: { id: string; name: string; color: string; members?: Array<{ id: string; name: string }> }
    }>
  }): Promise<void> {
    if (activeSessions.has(session.id)) {
      // Cache already built — sync in any teams added after the initial build
      // (e.g. teams added via admin UI after the session was first cached)
      const cache = activeSessions.get(session.id)!
      for (const st of session.sessionTeams) {
        if (!cache.teamScores.has(st.teamId)) {
          cache.teamScores.set(st.teamId, {
            sessionTeamId: st.id,
            teamId: st.teamId,
            teamName: st.team.name,
            teamColor: st.team.color,
            score: st.score,
            roundScores: JSON.parse(st.roundScores) as Record<string, number>,
            correctAnswerTimeMs: 0,
            members: st.team.members ?? [],
          })
        }
      }
      return
    }

    const rounds = await this.prisma.round.findMany({
      where: { quizId: session.quizId, deletedAt: null },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        gameMode: true,
        questionCount: true,
        timerSeconds: true,
        pointsPerQuestion: true,
        bonusPointsPerQuestion: true,
        audienceLevel: true,
      },
    })

    const teamScores = new Map<string, CachedTeamScore>()
    for (const st of session.sessionTeams) {
      teamScores.set(st.teamId, {
        sessionTeamId: st.id,
        teamId: st.teamId,
        teamName: st.team.name,
        teamColor: st.team.color,
        score: st.score,
        roundScores: JSON.parse(st.roundScores) as Record<string, number>,
        correctAnswerTimeMs: 0,
        members: st.team.members ?? [],
      })
    }

    const cachedRounds: CachedRound[] = rounds.map((r) => ({
      id: r.id,
      name: r.name,
      order: r.order,
      gameMode: r.gameMode,
      questionCount: r.questionCount,
      timerSeconds: r.timerSeconds,
      pointsPerQuestion: r.pointsPerQuestion,
      bonusPointsPerQuestion: r.bonusPointsPerQuestion,
      audienceLevel: r.audienceLevel as AudienceEngagementLevel,
    }))

    // Seed connectedTeamIds from DB records that are currently connected
    const alreadyConnected = new Set(
      session.sessionTeams.filter((st) => st.connected).map((st) => st.teamId),
    )

    activeSessions.set(session.id, {
      sessionId: session.id,
      sessionCode: session.sessionCode ?? '',
      quizId: session.quizId,
      status: session.status as SessionStatus,
      audienceCount: session.audienceMembers.length,
      rounds: cachedRounds,
      currentRoundIndex: 0,
      currentRoundId: null,
      currentRoundQuestions: [],
      currentQuestionIndex: 0,
      submittedTeams: new Set(),
      questionStartTime: 0,
      timerDeadline: 0,
      timerDurationMs: 0,
      questionTimerHandle: null,
      pausedAt: null,
      remainingMsAtPause: null,
      teamScores,
      connectedTeamIds: alreadyConnected,
      completedRoundIds: new Set(),
      audienceVoteTally: {},
      audienceVotePositionTally: {},
      audienceEmojiCount: {},
      audienceLevel:
        ((session as any).quiz?.defaultAudienceLevel as AudienceEngagementLevel) ||
        AudienceEngagementLevel.MEDIUM,
      activeInteraction: null,
    })
  }

  private async resolveRoundPredictions(
    sessionId: string,
    roundId: string,
    cache: SessionCache,
  ): Promise<
    Array<{ memberId: string; fullName: string; predictedRanking: string[]; pointsEarned: number }>
  > {
    const actualRanking = this.scoresArray(cache).map((s) => s.teamId)
    const preds = await this.prisma.audienceRoundPrediction.findMany({
      where: { sessionId, roundId },
      include: { member: { select: { id: true, fullName: true } } },
    })

    const results: Array<{
      memberId: string
      fullName: string
      predictedRanking: string[]
      pointsEarned: number
    }> = []

    for (const pred of preds) {
      const predicted: string[] = JSON.parse(pred.predictedRanking)
      let pts = 0
      for (let i = 0; i < predicted.length; i++) {
        if (predicted[i] === actualRanking[i])
          pts += GAME_CONSTANTS.AUDIENCE_RANKING_POINTS_PER_CORRECT_POSITION
      }

      void this.prisma.audienceRoundPrediction
        .update({ where: { id: pred.id }, data: { pointsEarned: pts, resolvedAt: new Date() } })
        .catch(() => undefined)

      if (pts > 0) {
        void this.prisma.audienceMember
          .update({
            where: { id: pred.audienceMemberId },
            data: { totalPoints: { increment: pts } },
          })
          .catch(() => undefined)
      }

      results.push({
        memberId: pred.audienceMemberId,
        fullName: pred.member.fullName,
        predictedRanking: predicted,
        pointsEarned: pts,
      })
    }

    return results
  }

  private async resolveAudienceInteractions(
    sessionId: string,
    questionId: string,
    teamResults: Array<{ teamId: string; isCorrect: boolean }>,
  ): Promise<void> {
    const cache = activeSessions.get(sessionId)
    if (!cache || !cache.activeInteraction) return

    const interaction = cache.activeInteraction
    // Only resolve if it's for the current question (or a round-level interaction if we add those)
    if (interaction.questionId && interaction.questionId !== questionId) return

    const question = cache.currentRoundQuestions.find((q) => q.id === questionId)
    if (!question) return

    const round = cache.rounds[cache.currentRoundIndex]
    const strategy = getStrategy(round?.gameMode ?? 'blitz')

    for (const [memberId, payload] of interaction.submissions) {
      let isCorrect = false
      
      if (interaction.type === AudienceInteractionType.PREDICTION) {
        if (interaction.activity === AudienceActivity.CLUE_DEPTH_PREDICTION) {
          const actualClueIndex = cache.clueReveal?.currentClueIndex ?? 0
          isCorrect = payload.predictedValue === actualClueIndex + 1
        } else {
          const res = teamResults.find((r) => r.teamId === payload.predictedTeamId)
          isCorrect = res?.isCorrect ?? false
        }
      } else if (interaction.type === AudienceInteractionType.GHOST_ANSWER) {
        const validation = strategy.validateAnswer(payload.answer, question)
        isCorrect = validation.correct
      }

      const points = strategy.calculateAudienceScore(interaction.activity, isCorrect, payload)

      // Persist to DB
      void this.prisma.audienceInteraction
        .create({
          data: {
            memberId,
            sessionId,
            questionId,
            type: interaction.type,
            activity: interaction.activity,
            payload: JSON.stringify(payload),
            pointsEarned: points,
            isCorrect,
          },
        })
        .catch(() => undefined)

      if (points > 0) {
        void this.prisma.audienceMember
          .update({
            where: { id: memberId },
            data: { totalPoints: { increment: points } },
            select: { totalPoints: true },
          })
          .then((updated) => {
            this.server.to(`audience:${memberId}`).emit(SERVER_EVENTS.AUDIENCE_POINTS_UPDATE, {
              pointsEarned: points,
              totalPoints: updated.totalPoints,
            })
          })
          .catch(() => undefined)
      }
    }

    // Interaction resolved, clear it
    cache.activeInteraction = null
  }

  // ─── Private: highlights computation ─────────────────────────────────────────

  private async computeHighlights(sessionId: string): Promise<SessionHighlights> {
    const fastest = await this.prisma.teamAnswer.findFirst({
      where: { sessionId, isCorrect: true },
      orderBy: { timeRemaining: 'desc' },
      include: {
        team: { select: { name: true } },
        question: { select: { text: true } },
      },
    })

    // Find Audience Accuracy King (minimum 5 interactions)
    const members = await this.prisma.audienceMember.findMany({
      where: { sessionId },
      select: { id: true, fullName: true },
    })

    let bestAccuracy = 0
    let accuracyKing: { nickname: string; accuracy: number } | undefined

    for (const m of members) {
      const interactions = await this.prisma.audienceInteraction.findMany({
        where: { memberId: m.id, sessionId },
      })
      if (interactions.length >= 3) {
        // Lowered to 3 for better visibility in small tests
        const correct = interactions.filter((i) => i.isCorrect).length
        const accuracy = Math.round((correct / interactions.length) * 100)
        if (accuracy > bestAccuracy) {
          bestAccuracy = accuracy
          accuracyKing = { nickname: m.fullName, accuracy }
        }
      }
    }

    return {
      fastestAnswer: fastest
        ? {
            teamName: fastest.team.name,
            timeRemaining: fastest.timeRemaining,
            questionText: fastest.question.text,
          }
        : undefined,
      audienceAccuracyKing: accuracyKing,
    }
  }

  // ─── Private: payload builders ────────────────────────────────────────────────

  private buildStateSnapshot(sessionId: string): object {
    const cache = activeSessions.get(sessionId)
    if (!cache) return { sessionId, status: SessionStatus.LOBBY, scores: [], audienceCount: 0 }
    const round = cache.currentRoundId ? cache.rounds[cache.currentRoundIndex] : undefined
    const scores = this.scoresArray(cache)
    const isLastRound = cache.completedRoundIds.size >= cache.rounds.length

    const base: Record<string, unknown> = {
      sessionId,
      sessionCode: cache.sessionCode,
      status: cache.status,
      scores,
      audienceCount: cache.audienceCount,
      connectedTeamIds: Array.from(cache.connectedTeamIds),
      completedRoundIds: Array.from(cache.completedRoundIds),
      isLastRound,
      currentRoundId: cache.currentRoundId,
      serverTime: Date.now(), // clients use this to sync their local clocks
    }

    if (round && cache.currentRoundId) {
      base['currentRound'] = this.serializeRound(round, cache.quizId)
      base['currentQuestionIndex'] = cache.currentQuestionIndex
      base['totalQuestions'] = cache.currentRoundQuestions.length
    }

    if (
      cache.status === SessionStatus.QUESTION_OPEN ||
      cache.status === SessionStatus.QUESTION_LOCKED
    ) {
      base['timerData'] = { startTime: cache.questionStartTime, durationMs: cache.timerDurationMs }
    }

    if (cache.status === SessionStatus.UC_TEAM_SELECT || cache.status === SessionStatus.UC_ACTIVE) {
      base['ucState'] = this.buildUCState(sessionId, cache)
    }

    if (cache.status === SessionStatus.CLUE_OPEN || cache.status === SessionStatus.CLUE_ANSWERING) {
      base['clueState'] = this.buildClueState(sessionId, cache)
    }

    // Include bonus timer so reconnecting clients can reconstruct the countdown
    if (cache.status === SessionStatus.BONUS_ANSWERING && cache.tileBlitz) {
      base['bonusTimerData'] = {
        startTime: cache.tileBlitz.bonusTimerStartTime,
        durationMs: cache.tileBlitz.bonusTimerDurationMs,
      }
    }

    return base
  }

  private scoresArray(cache: SessionCache): TeamScore[] {
    const raw = Array.from(cache.teamScores.values())
    const arr = raw.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      teamColor: t.teamColor,
      score: t.score,
      rank: 0,
      roundScores: t.roundScores,
      members: t.members,
      // Include tiebreaker in payload so frontend can display tie context
      tiebreakerMs: t.correctAnswerTimeMs,
    }))
    // Sort: score DESC, then correctAnswerTimeMs DESC (faster cumulative answers win the tie)
    arr.sort((a, b) => b.score - a.score || b.tiebreakerMs - a.tiebreakerMs)
    arr.forEach((s, i) => {
      s.rank = i + 1
    })
    return arr
  }

  private teamsArray(cache: SessionCache): Array<{ id: string; name: string; color: string }> {
    return Array.from(cache.teamScores.values()).map((t) => ({
      id: t.teamId,
      name: t.teamName,
      color: t.teamColor,
    }))
  }

  private serializeRound(round: CachedRound, quizId: string): object {
    return {
      id: round.id,
      quizId,
      order: round.order,
      name: round.name ?? undefined,
      gameMode: round.gameMode as GameMode,
      questionCount: round.questionCount,
      timerSeconds: round.timerSeconds,
      pointsPerQuestion: round.pointsPerQuestion,
      bonusPointsPerQuestion: round.bonusPointsPerQuestion,
      audienceLevel: round.audienceLevel,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
  }

  private async audienceLeaderboard(
    sessionId: string,
    take = 20,
  ): Promise<AudienceLeaderboardEntry[]> {
    const members = await this.prisma.audienceMember.findMany({
      where: { sessionId },
      orderBy: { totalPoints: 'desc' },
      take,
      select: { id: true, fullName: true, totalPoints: true },
    })
    return members.map((m, i) => ({
      rank: i + 1,
      memberId: m.id,
      nickname: m.fullName,
      totalPoints: m.totalPoints,
    }))
  }

  // ─── Audience Interaction Helpers ─────────────────────────────────────────────

  private startAudienceInteraction(
    sessionId: string,
    cache: SessionCache,
    activity: AudienceActivity,
  ): void {
    if (cache.activeInteraction) {
      if (cache.activeInteraction.handle) clearTimeout(cache.activeInteraction.handle)
    }

    let type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.EMOJI_REACT) return // handled elsewhere
    if (activity === AudienceActivity.ROUND_RANKING) return // handled elsewhere

    // Map activity to type
    if (activity === AudienceActivity.QUESTION_PREDICTION) type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.STEAL_PREDICTION) type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.DUEL_PREDICTION) type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.CLUE_DEPTH_PREDICTION)
      type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.TRUE_FALSE) type = AudienceInteractionType.PREDICTION
    if (activity === AudienceActivity.GHOST_ANSWER) type = AudienceInteractionType.GHOST_ANSWER

    const durationMs = activity === AudienceActivity.GHOST_ANSWER ? 20000 : 15000
    const deadline = Date.now() + durationMs

    cache.activeInteraction = {
      type,
      activity,
      questionId: cache.currentRoundQuestions[cache.currentQuestionIndex]?.id,
      deadline,
      handle: setTimeout(() => this.closeAudienceInteraction(sessionId, cache), durationMs),
      tally: {},
      totalSubmissions: 0,
      submissions: new Map(),
    }

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.AUDIENCE_INTERACTION_START, {
      activity,
      type,
      questionId: cache.activeInteraction.questionId,
      durationMs,
      prompt: this.getInteractionPrompt(activity, cache),
      options: this.getInteractionOptions(activity, cache),
    })
  }

  private checkAndTriggerAudienceActivity(sessionId: string, cache: SessionCache): void {
    const level = cache.audienceLevel
    if (level === AudienceEngagementLevel.LOW) return

    const shouldTrigger =
      level === AudienceEngagementLevel.HIGH ||
      (level === AudienceEngagementLevel.MEDIUM && cache.currentQuestionIndex % 2 === 0)

    if (!shouldTrigger) return

    const round = cache.rounds[cache.currentRoundIndex]
    const gameMode = round?.gameMode ?? 'blitz'
    const qi = cache.currentQuestionIndex
    const question = cache.currentRoundQuestions[qi]
    const isOpen = question?.type === 'open' || question?.type === 'fillinblank'

    const activity = this.selectActivity(gameMode, qi, isOpen, level)
    this.startAudienceInteraction(sessionId, cache, activity)
  }

  private selectActivity(
    gameMode: string,
    questionIndex: number,
    isOpen: boolean,
    level: AudienceEngagementLevel,
  ): AudienceActivity {
    const hi = level === AudienceEngagementLevel.HIGH

    switch (gameMode) {
      case 'blitz':
        // Rotate: ghost on odd questions (open only), prediction otherwise; HIGH adds extra ghost
        if (questionIndex % 2 === 1 && isOpen) return AudienceActivity.GHOST_ANSWER
        if (hi && questionIndex % 3 === 2 && isOpen) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.QUESTION_PREDICTION

      case 'tile_blitz':
        // Turn-based: ghost answer engages audience when they know the subject
        if (isOpen) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.QUESTION_PREDICTION

      case 'steal':
        // Steal-specific prediction most of the time; ghost on HIGH every 3rd
        if (hi && questionIndex % 3 === 0 && isOpen) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.STEAL_PREDICTION

      case 'hot_seat':
        // One team answering — audience guesses along or predicts
        if (hi && questionIndex % 3 === 1 && isOpen) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.QUESTION_PREDICTION

      case 'clue_reveal':
        // Depth prediction is core; on HIGH rotate in ghost answers
        if (hi && questionIndex % 3 === 2) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.CLUE_DEPTH_PREDICTION

      case 'duel':
        // Head-to-head duel prediction; ghost on alternate open questions
        if (questionIndex % 2 === 1 && isOpen) return AudienceActivity.GHOST_ANSWER
        return AudienceActivity.DUEL_PREDICTION

      case 'picture':
        // Picture rounds are always ghost — audience identifies the image
        return AudienceActivity.GHOST_ANSWER

      case 'true_false_blitz':
        // Audience votes True/False along with teams
        return AudienceActivity.TRUE_FALSE

      case 'lightning':
        // Speed round — simple team prediction
        return AudienceActivity.QUESTION_PREDICTION

      case 'wager':
        // Audience predicts which team wagered correctly
        return AudienceActivity.QUESTION_PREDICTION

      case 'elimination':
        // Stakes are high — who survives?
        return AudienceActivity.QUESTION_PREDICTION

      default:
        return AudienceActivity.QUESTION_PREDICTION
    }
  }

  private getInteractionOptions(
    activity: AudienceActivity,
    cache: SessionCache,
  ): any[] | undefined {
    if (activity === AudienceActivity.CLUE_DEPTH_PREDICTION) {
      return [
        { label: 'Clue 1', value: 1 },
        { label: 'Clue 2', value: 2 },
        { label: 'Clue 3', value: 3 },
        { label: 'Last Clue', value: 4 },
      ]
    }

    const type = this.getActivityType(activity)
    if (type === AudienceInteractionType.PREDICTION) {
      return this.teamsArray(cache)
    }
    return undefined
  }

  private getActivityType(activity: AudienceActivity): AudienceInteractionType {
    if (activity === AudienceActivity.GHOST_ANSWER) return AudienceInteractionType.GHOST_ANSWER
    return AudienceInteractionType.PREDICTION
  }

  private closeAudienceInteraction(sessionId: string, cache: SessionCache): void {
    if (!cache.activeInteraction) return
    const activity = cache.activeInteraction.activity

    if (cache.activeInteraction.handle) {
      clearTimeout(cache.activeInteraction.handle)
      cache.activeInteraction.handle = null
    }

    this.server.to(`session:${sessionId}`).emit(SERVER_EVENTS.AUDIENCE_INTERACTION_CLOSE, {
      activity,
      results: cache.activeInteraction.tally,
    })
  }

  private getInteractionPrompt(activity: AudienceActivity, cache: SessionCache): string {
    const round = cache.rounds[cache.currentRoundIndex]
    const gameMode = round?.gameMode ?? 'blitz'
    const qi = cache.currentQuestionIndex
    const tb = cache.tileBlitz
    const activeTeam = tb
      ? cache.teamScores.get(tb.turnOrderTeamIds[tb.currentTurnIndex] ?? '')
      : null

    switch (activity) {
      case AudienceActivity.QUESTION_PREDICTION: {
        const pools: Record<string, string[]> = {
          blitz: [
            'Which team will answer this one correctly?',
            'Who will get it right?',
            'Which team will be on the money here?',
            'Fastest fingers — who will get it?',
            'Pick your winner for this question!',
          ],
          hot_seat: activeTeam
            ? [
                `Will ${activeTeam.teamName} know the answer?`,
                `Can ${activeTeam.teamName} handle the pressure?`,
                `${activeTeam.teamName} is in the hot seat — will they deliver?`,
              ]
            : ['Will they get it right?', 'Can they handle the pressure?', 'Under the spotlight — will they know it?'],
          tile_blitz: activeTeam
            ? [
                `Will ${activeTeam.teamName} get this tile?`,
                `${activeTeam.teamName} is up — will they know it?`,
                `Can ${activeTeam.teamName} claim this tile?`,
              ]
            : ['Will they claim this tile?'],
          lightning: [
            'Speed round — who will nail it?',
            'Lightning fast — pick a team!',
            'Who will keep their streak alive?',
            'No hesitation — who will answer?',
          ],
          wager: [
            'Which team will wager correctly?',
            "Who will bet on the right answer?",
            "Bold move — which team's bet will pay off?",
          ],
          elimination: [
            'Who will survive this question?',
            'Which team will stay in the game?',
            'One wrong answer costs everything — who will get it right?',
            'Life on the line — which team will know it?',
          ],
        }
        const pool = pools[gameMode] ?? [
          'Who will get this right?',
          'Pick the winning team!',
          'Which team will know this one?',
          'Your prediction — who will answer correctly?',
        ]
        return pool[qi % pool.length]!
      }

      case AudienceActivity.STEAL_PREDICTION: {
        const pool = [
          'Which team will steal the points?',
          'Who will swoop in for the steal?',
          'Name your thief — who will take it?',
          'Eyes on the prize — who will steal it?',
          'The points are up for grabs — who will want them?',
        ]
        return pool[qi % pool.length]!
      }

      case AudienceActivity.DUEL_PREDICTION: {
        const pool = [
          'Who will win this duel?',
          'Face to face — pick your champion!',
          'One will fall — who will win?',
          'Head to head — who will take the points?',
          'The clash is on — who will come out on top?',
        ]
        return pool[qi % pool.length]!
      }

      case AudienceActivity.CLUE_DEPTH_PREDICTION: {
        const pool = [
          'How many clues does it take?',
          'Will one clue be enough?',
          'Predict the clue depth — how many needed?',
          'Can they crack it on the very first clue?',
          'How deep into the clues do they go?',
        ]
        return pool[qi % pool.length]!
      }

      case AudienceActivity.GHOST_ANSWER: {
        const pools: Record<string, string[]> = {
          blitz: [
            'Think you know it? Type your answer!',
            'Prove it — what is your answer?',
            'Join in! What would your answer be?',
            'Beat the teams — type your answer now!',
          ],
          tile_blitz: [
            'You know this — type your answer!',
            'Ghost player activated — what is it?',
            'Answer along with the team!',
            'Can you do better? Type it!',
          ],
          picture: [
            'Identify what you see — what is it?',
            'What is pictured here?',
            'Name it! What do you see?',
            'Look closely — what is this?',
          ],
          clue_reveal: [
            'Crack it early — what is the answer?',
            'Read the clues — what do you think?',
            'Beat the teams to it — your answer?',
            'Got it already? Type it in!',
          ],
          steal: [
            'Do you know the answer? Type it!',
            "If you were stealing, what's your answer?",
            'Ghost answerer — what would you say?',
          ],
        }
        const pool = pools[gameMode] ?? [
          'What do you think the answer is?',
          'Take a guess — what is it?',
          'Your answer — type it now!',
          'Join in — what is the answer?',
        ]
        return pool[qi % pool.length]!
      }

      case AudienceActivity.TRUE_FALSE: {
        const pool = [
          'True or False — what does the audience say?',
          'Vote True or False right now!',
          'Make your call — True or False?',
          "What's it going to be — True or False?",
        ]
        return pool[qi % pool.length]!
      }

      default:
        return 'Participate now!'
    }
  }

  private isModerator(client: Socket): boolean {
    return (client.data as SocketData | undefined)?.role === UserRole.MODERATOR
  }
}
