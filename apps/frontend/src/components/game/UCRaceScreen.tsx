'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface UCTeamState {
  teamId: string
  teamName: string
  teamColor: string
  score: number
  progress: number   // 0–1
  remaining: number
  isActive: boolean
}

interface UCRaceScreenProps {
  teams: UCTeamState[]
  currentQuestion?: { id: string; text: string } | null
  timeLeft: number
  lastAction?: string | null
  activeTeamName?: string
}

// ─── Runner avatar (letter + glow) ───────────────────────────────────────────

function Runner({ team, size = 40 }: { team: UCTeamState; size?: number }) {
  const initial = team.teamName[0]?.toUpperCase() ?? '?'
  return (
    <motion.div
      animate={team.isActive ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: team.teamColor,
        border: `3px solid ${team.isActive ? 'white' : team.teamColor}`,
        boxShadow: team.isActive
          ? `0 0 0 4px ${team.teamColor}44, 0 0 20px ${team.teamColor}88`
          : `0 0 8px ${team.teamColor}66`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 900,
        color: 'white',
        flexShrink: 0,
        zIndex: 2,
        position: 'relative',
      }}
    >
      {initial}
      {/* Active crown */}
      {team.isActive && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-5 left-1/2 -translate-x-1/2 text-base"
        >
          👑
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── Single lane ─────────────────────────────────────────────────────────────

function RaceLane({ team, index }: { team: UCTeamState; index: number }) {
  const LANE_H = 64

  return (
    <motion.div
      initial={{ opacity: 0, x: -60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, type: 'spring', stiffness: 60 }}
      className="relative flex items-center gap-4"
      style={{ height: LANE_H }}
    >
      {/* Team name label */}
      <div
        className="w-36 flex-shrink-0 text-right"
        style={{ opacity: team.isActive ? 1 : 0.55 }}
      >
        <p className="text-sm font-black text-white leading-tight truncate">{team.teamName}</p>
        <p className="text-[10px] font-bold" style={{ color: team.teamColor }}>
          {team.score} pts · {team.remaining} left
        </p>
      </div>

      {/* Track lane */}
      <div className="relative flex-1 flex items-center" style={{ height: LANE_H }}>
        {/* Lane background */}
        <div
          className="absolute inset-y-3 left-0 right-0 rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: team.isActive ? `1px solid ${team.teamColor}44` : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Checkpoint markers */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${pct}%`, backgroundColor: 'rgba(255,255,255,0.08)' }}
            />
          ))}

          {/* Progress fill */}
          <motion.div
            animate={{ width: `${Math.max(team.progress * 100, 0)}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
            className="absolute inset-y-0 left-0 rounded-xl"
            style={{
              background: `linear-gradient(90deg, ${team.teamColor}88, ${team.teamColor})`,
              minWidth: team.progress > 0 ? 8 : 0,
            }}
          />

          {/* % label */}
          <div className="absolute inset-0 flex items-center justify-end pr-3">
            <span className="text-[10px] font-bold text-white/30">
              {Math.round(team.progress * 100)}%
            </span>
          </div>
        </div>

        {/* Runner at leading edge */}
        <motion.div
          animate={{ left: `calc(${Math.max(team.progress * 100, 0)}% - 20px)` }}
          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          className="absolute"
          style={{ zIndex: 3 }}
        >
          <Runner team={team} size={40} />
        </motion.div>
      </div>

      {/* Finish flag */}
      <div className="flex-shrink-0 text-2xl opacity-30">🏁</div>
    </motion.div>
  )
}

// ─── Timer ring ───────────────────────────────────────────────────────────────

function TimerRing({ seconds, maxSeconds = 60 }: { seconds: number; maxSeconds?: number }) {
  const pct = Math.max(0, seconds / maxSeconds)
  const radius = 32
  const circ = 2 * Math.PI * radius
  const dash = circ * pct

  const color = seconds <= 10 ? '#EF4444' : seconds <= 20 ? '#F59E0B' : '#22C55E'

  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" className="absolute rotate-[-90deg]">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <motion.circle
          cx="44" cy="44" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </svg>
      <motion.span
        key={seconds}
        initial={{ scale: 1.3, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative text-2xl font-black tabular-nums"
        style={{ color }}
      >
        {seconds}
      </motion.span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UCRaceScreen({ teams, currentQuestion, timeLeft, lastAction, activeTeamName }: UCRaceScreenProps) {
  const activeTeam = teams.find((t) => t.isActive)

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0F0F13]">
      {/* Background radial from active team */}
      {activeTeam && (
        <motion.div
          key={activeTeam.teamId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${activeTeam.teamColor}15 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-10 pt-8 pb-4">
        <div>
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-white/30 mb-1">
            Ultimate Challenge
          </p>
          <h1 className="text-4xl font-black text-white">Race to the Finish</h1>
        </div>
        <TimerRing seconds={timeLeft} maxSeconds={60} />
      </div>

      {/* Race track */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-10 gap-3 py-4">
        {/* START / FINISH labels */}
        <div className="flex items-center mb-1">
          <div className="w-36 flex-shrink-0" />
          <div className="flex-1 flex justify-between px-1">
            <span className="text-[10px] font-bold tracking-widest uppercase text-white/20">Start</span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-white/20">Finish</span>
          </div>
          <div className="w-10 flex-shrink-0" />
        </div>

        {teams
          .slice()
          .sort((a, b) => b.progress - a.progress)
          .map((team, i) => (
            <RaceLane key={team.teamId} team={team} index={i} />
          ))}
      </div>

      {/* Question panel */}
      <div className="relative z-10 mx-10 mb-8 rounded-2xl border border-white/8 bg-white/[0.04] p-5 backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {activeTeam && (
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeTeam.teamColor }} />
              )}
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: activeTeam?.teamColor ?? 'white' }}>
                {activeTeamName ?? 'Waiting…'}
              </span>
              {lastAction && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={lastAction}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="ml-2 text-xs text-white/40 italic"
                  >
                    {lastAction}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>
            <AnimatePresence>
              {currentQuestion ? (
                <motion.p
                  key={currentQuestion.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-2xl font-bold text-white leading-snug"
                >
                  {currentQuestion.text}
                </motion.p>
              ) : (
                <motion.p
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xl text-white/40"
                >
                  All teams completed! 🎉
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
