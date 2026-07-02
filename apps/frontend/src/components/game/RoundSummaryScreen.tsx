'use client'
import { motion } from 'framer-motion'
import { ConfettiCanvas } from './ConfettiCanvas'

interface RoundTeamScore {
  teamId: string
  teamName: string
  teamColor: string
  roundPoints: number
  totalScore: number
}

interface AudienceStats {
  accuracyPercentage: number
  correctInteractions: number
  totalInteractions: number
}

interface AudienceEntry {
  memberId: string
  nickname: string
  totalPoints: number
  rank: number
}

interface RoundSummaryScreenProps {
  roundName?: string
  standings: RoundTeamScore[]       // sorted by roundPoints desc
  audienceStats?: AudienceStats
  audienceLeaderboard?: AudienceEntry[]
}

const MEDALS = ['🥇', '🥈', '🥉']

// bar width as % of max points
function BarWidth(pts: number, max: number) {
  return max > 0 ? Math.max(6, (pts / max) * 100) : 6
}

export function RoundSummaryScreen({
  roundName,
  standings,
  audienceStats,
  audienceLeaderboard = [],
}: RoundSummaryScreenProps) {
  const maxPts = standings[0]?.roundPoints ?? 1

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0F0F13]">
      {/* Short confetti burst for round winner */}
      {standings[0] && <ConfettiCanvas color={standings[0].teamColor} count={40} duration={4000} />}

      {/* dramatic diagonal glow from winner colour */}
      {standings[0] && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 55% 50% at 30% 40%, ${standings[0].teamColor}18 0%, transparent 70%)`,
          }}
        />
      )}

      {/* ── left: team standings ── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-16 py-12">
        {/* header */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/40 mb-1">
            Round Complete
          </p>
          <h2 className="text-6xl font-black text-white leading-none">
            {roundName ?? 'Round'} <span className="text-white/40">Results</span>
          </h2>
        </motion.div>

        {/* bars */}
        <div className="space-y-5">
          {standings.map((s, i) => (
            <motion.div
              key={s.teamId}
              initial={{ opacity: 0, x: -80 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.14, type: 'spring', stiffness: 55, damping: 14 }}
              className="flex items-center gap-5"
            >
              {/* rank medal */}
              <span className="w-10 text-3xl text-center flex-shrink-0">
                {MEDALS[i] ?? `#${i + 1}`}
              </span>

              {/* dot + name */}
              <div className="w-44 flex-shrink-0 flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.teamColor, boxShadow: `0 0 8px ${s.teamColor}` }}
                />
                <span className="text-lg font-bold text-white truncate">{s.teamName}</span>
              </div>

              {/* animated bar */}
              <div className="flex-1 relative h-12 rounded-xl overflow-hidden bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${BarWidth(s.roundPoints, maxPts)}%` }}
                  transition={{ delay: 0.4 + i * 0.14, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-xl flex items-center px-4"
                  style={{ backgroundColor: s.teamColor, opacity: i === 0 ? 1 : 0.7 }}
                />
                {/* points label over the bar */}
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 + i * 0.14 }}
                  className="absolute inset-y-0 left-4 flex items-center text-xl font-black text-white"
                >
                  +{s.roundPoints}
                </motion.span>
              </div>

              {/* total */}
              {/* <div className="w-24 text-right flex-shrink-0">
                <p className="text-2xl font-black text-white/60 tabular-nums">{s.totalScore}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-wider">total</p>
              </div> */}
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── right: audience panel ── */}
      {(audienceStats || audienceLeaderboard.length > 0) && (
        <div className="relative z-10 flex w-80 flex-shrink-0 flex-col justify-center gap-6 border-l border-white/5 px-8 py-12">
          {audienceStats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="rounded-2xl border border-[#3B82F6]/20 bg-[#3B82F6]/10 p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-bold tracking-widest uppercase text-[#3B82F6]">
                  Audience Predictions
                </p>
                <span className="text-[10px] text-white/25 font-medium">just for fun</span>
              </div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-black text-white">
                  {audienceStats.accuracyPercentage}%
                </span>
                <div className="mb-1 text-xs text-white/40 leading-tight">
                  {audienceStats.correctInteractions} / {audienceStats.totalInteractions}
                  <br />got it right
                </div>
              </div>
              {/* accuracy bar */}
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${audienceStats.accuracyPercentage}%` }}
                  transition={{ delay: 1, duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full bg-[#3B82F6]"
                />
              </div>
            </motion.div>
          )}

          {audienceLeaderboard.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <p className="text-xs font-bold tracking-widest uppercase text-[#F59E0B] mb-4">
                Top Audience
              </p>
              <div className="space-y-2">
                {audienceLeaderboard.slice(0, 5).map((a, i) => (
                  <motion.div
                    key={a.memberId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1 + i * 0.08 }}
                    className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
                  >
                    <span className="text-[#F59E0B] font-bold text-sm w-5">#{a.rank}</span>
                    <span className="flex-1 truncate text-sm text-white">{a.nickname}</span>
                    <span className="text-[#F59E0B] font-bold tabular-nums">{a.totalPoints}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
