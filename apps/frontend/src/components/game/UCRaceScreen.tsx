'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface UCTeamState {
  teamId: string
  teamName: string
  teamColor: string
  score: number
  progress: number   // 0–1
  remaining: number
  total: number
  isActive: boolean
  isCompleted: boolean
}

interface UCRaceScreenProps {
  teams: UCTeamState[]
  currentQuestion?: { id: string; text: string } | null
  timeLeft: number
  lastAction?: string | null
  activeTeamName?: string
  activeTeamColor?: string
}

function timerColor(t: number) {
  if (t <= 5) return '#EF4444'
  if (t <= 15) return '#F59E0B'
  return '#22C55E'
}

export function UCRaceScreen({
  teams,
  currentQuestion,
  timeLeft,
  lastAction,
  activeTeamName,
  activeTeamColor,
}: UCRaceScreenProps) {
  const activeTeam = teams.find((t) => t.isActive)
  const accentColor = activeTeamColor ?? activeTeam?.teamColor ?? '#3B82F6'
  const tColor = timerColor(timeLeft)
  const isUrgent = timeLeft <= 5
  const isWarning = timeLeft <= 15 && !isUrgent

  // Sort by score descending; ties broken by progress
  const sortedTeams = [...teams].sort(
    (a, b) => b.score - a.score || b.progress - a.progress,
  )
  const maxScore = Math.max(1, ...teams.map((t) => t.score))

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0A0A0F] select-none">
      {/* ── Ambient background glow — shifts with tension ── */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{
          background: isUrgent
            ? `radial-gradient(ellipse 90% 70% at 50% 50%, rgba(239,68,68,0.16) 0%, transparent 65%)`
            : isWarning
              ? `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(245,158,11,0.10) 0%, transparent 65%)`
              : `radial-gradient(ellipse 70% 55% at 50% 30%, ${accentColor}14 0%, transparent 65%)`,
        }}
        transition={{ duration: 1 }}
      />

      {/* ── Red vignette flash at ≤5s ── */}
      <AnimatePresence>
        {isUrgent && (
          <motion.div
            key={`flash-${timeLeft}`}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(239,68,68,0.25) 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      {/* ── Top team-color accent stripe ── */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[3px] origin-left"
        style={{ backgroundColor: accentColor }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      {/* ── Header: active team identity ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-10 flex items-center justify-between px-10 pt-7 pb-3"
      >
        {/* Active team */}
        <div className="flex items-center gap-4">
          <motion.span
            animate={isUrgent ? { rotate: [-8, 8, -8] } : isWarning ? { rotate: [-4, 4, -4] } : {}}
            transition={{ repeat: Infinity, duration: 0.35 }}
            className="text-3xl leading-none"
          >
            👑
          </motion.span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/25 mb-0.5">
              Now Playing
            </p>
            <motion.h2
              className="text-3xl font-black leading-none"
              style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}60` }}
              animate={isUrgent ? { x: [0, -3, 3, -3, 3, 0] } : {}}
              transition={{ duration: 0.4, repeat: isUrgent ? Infinity : 0 }}
            >
              {activeTeamName ?? '—'}
            </motion.h2>
          </div>
        </div>

        {/* Right: last action + UC badge */}
        <div className="flex items-center gap-5">
          <AnimatePresence mode="wait">
            {lastAction && (
              <motion.span
                key={lastAction}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm italic text-white/35"
              >
                {lastAction}
              </motion.span>
            )}
          </AnimatePresence>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
              Ultimate Challenge
            </p>
          </div>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════
          CENTER: Question hero + Timer (the two dominant elements)
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-10">

        {/* ── QUESTION CARD ── */}
        <div className="w-full max-w-5xl">
          <AnimatePresence mode="wait">
            {currentQuestion ? (
              <motion.div
                key={currentQuestion.id}
                initial={{ opacity: 0, y: 28, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 90, damping: 16 }}
                className="relative rounded-3xl px-12 py-10 text-center"
                style={{
                  border: `2px solid ${accentColor}45`,
                  background: `linear-gradient(135deg, ${accentColor}0C 0%, rgba(255,255,255,0.018) 100%)`,
                  boxShadow: isUrgent
                    ? `0 0 80px rgba(239,68,68,0.28), 0 0 0 1px rgba(239,68,68,0.15), inset 0 0 40px rgba(239,68,68,0.04)`
                    : `0 0 60px ${accentColor}22, inset 0 0 40px ${accentColor}06`,
                }}
              >
                {/* Animated shimmer line at top of card */}
                <motion.div
                  className="absolute top-0 left-8 right-8 h-px rounded-full"
                  style={{ background: `linear-gradient(90deg, transparent, ${accentColor}80, transparent)` }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                />

                <p
                  className="font-black text-white leading-snug"
                  style={{ fontSize: 'clamp(2rem, 4.5vw, 4rem)' }}
                >
                  {currentQuestion.text}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <span className="text-7xl">🎉</span>
                <p className="text-4xl font-black text-white">All questions completed!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── TIMER ── */}
        <div className="relative flex flex-col items-center gap-1">
          {/* Outer glow ring */}
          <motion.div
            className="absolute rounded-full"
            animate={{
              width: isUrgent ? 220 : isWarning ? 196 : 172,
              height: isUrgent ? 220 : isWarning ? 196 : 172,
              boxShadow: isUrgent
                ? `0 0 90px rgba(239,68,68,0.55), 0 0 130px rgba(239,68,68,0.25)`
                : isWarning
                  ? `0 0 70px rgba(245,158,11,0.45)`
                  : `0 0 50px ${accentColor}45`,
              borderColor: isUrgent
                ? 'rgba(239,68,68,0.35)'
                : isWarning
                  ? 'rgba(245,158,11,0.30)'
                  : `${accentColor}35`,
            }}
            style={{ border: '2px solid', backgroundColor: 'transparent' }}
            transition={{ duration: 0.5 }}
          />

          {/* Number — keyed so it re-animates every second */}
          <motion.span
            key={timeLeft}
            initial={{ scale: 1.18, opacity: 0.65 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className="relative tabular-nums font-black leading-none"
            style={{
              fontSize: '9.5rem',
              color: tColor,
              textShadow: `0 0 50px ${tColor}90, 0 0 100px ${tColor}40`,
            }}
          >
            {timeLeft}
          </motion.span>

          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20">
            seconds
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BOTTOM: Score bars
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 px-10 pb-8 pt-2">
        <p className="mb-3 text-[9px] font-black uppercase tracking-[0.3em] text-white/18">
          Scoreboard
        </p>
        <div className="space-y-2.5">
          {sortedTeams.map((team, i) => {
            const isLeader = i === 0 && team.score > 0
            const barPct = maxScore > 0 ? (team.score / maxScore) * 100 : 0

            return (
              <motion.div
                key={team.teamId}
                layout
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                className="flex items-center gap-3"
              >
                {/* Rank */}
                <span className="w-4 flex-shrink-0 text-right text-xs font-black text-white/20">
                  {i + 1}
                </span>

                {/* Team dot + name */}
                <div className="flex w-28 flex-shrink-0 items-center gap-2">
                  <motion.div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: team.teamColor }}
                    animate={team.isActive ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.1 }}
                  />
                  <span
                    className="truncate text-sm font-black leading-tight"
                    style={{
                      color: team.isActive
                        ? team.teamColor
                        : team.isCompleted
                          ? 'rgba(255,255,255,0.55)'
                          : 'rgba(255,255,255,0.65)',
                    }}
                  >
                    {team.teamName}
                  </span>
                </div>

                {/* Score bar */}
                <div className="relative flex-1">
                  <div className="h-6 overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.03]">
                    <motion.div
                      className="h-full rounded-xl"
                      animate={{ width: `${barPct}%` }}
                      transition={{ type: 'spring', stiffness: 55, damping: 16 }}
                      style={{
                        background: `linear-gradient(90deg, ${team.teamColor}70, ${team.teamColor})`,
                        minWidth: team.score > 0 ? 8 : 0,
                        boxShadow: team.isActive
                          ? `0 0 14px ${team.teamColor}70`
                          : undefined,
                      }}
                    />
                  </div>
                  {/* Completed badge inside bar */}
                  {team.isCompleted && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2">
                      <span className="text-[9px] font-black uppercase tracking-wide text-white/40">
                        done
                      </span>
                    </div>
                  )}
                </div>

                {/* Score + trophy */}
                <div className="flex w-24 flex-shrink-0 items-center justify-end gap-1.5">
                  <motion.span
                    layout
                    className="text-base font-black tabular-nums"
                    style={{ color: team.teamColor }}
                  >
                    {team.score}
                  </motion.span>
                  <span className="text-[10px] text-white/25">pts</span>
                  {isLeader && (
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="text-sm"
                    >
                      🏆
                    </motion.span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
