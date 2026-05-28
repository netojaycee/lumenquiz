'use client'
import { motion } from 'framer-motion'
import type { TeamScore } from '@apoquiz/shared-types'
import { ConfettiCanvas } from './ConfettiCanvas'

interface AudienceEntry {
  memberId: string
  nickname: string
  totalPoints: number
  rank: number
}

interface CumulativeScreenProps {
  finalScores: TeamScore[]
  audienceLeaderboard?: AudienceEntry[]
}

const MEDALS = ['🥇', '🥈', '🥉']
const PODIUM_HEIGHT = [200, 140, 100] // px heights for 1st/2nd/3rd

function PodiumBlock({ score, position, delay }: { score: TeamScore; position: number; delay: number }) {
  const height = PODIUM_HEIGHT[position] ?? 80
  const isFirst = position === 0

  return (
    <motion.div
      className="flex flex-col items-center gap-0"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 60 }}
    >
      {/* floating name card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.3, type: 'spring', stiffness: 120 }}
        className="mb-3 flex flex-col items-center gap-1"
      >
        <span className="text-3xl">{MEDALS[position] ?? `#${position + 1}`}</span>
        <div
          className="flex items-center gap-2 rounded-xl border px-4 py-2"
          style={{
            borderColor: score.teamColor,
            backgroundColor: `${score.teamColor}18`,
            boxShadow: isFirst ? `0 0 28px ${score.teamColor}44` : undefined,
          }}
        >
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: score.teamColor }} />
          <span className="font-black text-white text-lg">{score.teamName}</span>
        </div>

        {/* score with count-up feel */}
        <motion.span
          className="text-4xl font-black tabular-nums"
          style={{ color: score.teamColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5 }}
        >
          {score.score}
        </motion.span>
        <span className="text-xs text-white/30 uppercase tracking-widest">pts</span>
      </motion.div>

      {/* podium block rising from bottom */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height }}
        transition={{ delay: delay + 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-36 flex items-start justify-center pt-3 rounded-t-xl"
        style={{
          backgroundColor: isFirst ? score.teamColor : `${score.teamColor}50`,
          border: `2px solid ${score.teamColor}`,
          borderBottom: 'none',
        }}
      >
        <span className="text-2xl font-black text-white/70">
          {position === 0 ? '1' : position === 1 ? '2' : '3'}
        </span>
      </motion.div>
    </motion.div>
  )
}

export function CumulativeScreen({ finalScores, audienceLeaderboard = [] }: CumulativeScreenProps) {
  // podium order: 2nd, 1st, 3rd (centre peak)
  const top3 = finalScores.slice(0, 3)
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : [top3[0]]
  const podiumPositions = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0]

  const rest = finalScores.slice(3)
  const winner = finalScores[0]

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[#0F0F13] px-8 py-10">
      {/* Light confetti burst on reveal */}
      {winner && <ConfettiCanvas color={winner.teamColor} count={60} duration={8000} />}

      {/* radial spotlight on winner */}
      {winner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 50% 60% at 50% 30%, ${winner.teamColor}20 0%, transparent 70%)`,
          }}
        />
      )}

      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mb-10 text-center"
      >
        <p className="text-xs font-bold tracking-[0.3em] uppercase text-white/30 mb-1">
          After All Rounds
        </p>
        <h1 className="text-5xl font-black text-white">Overall Standings</h1>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mx-auto mt-2 h-1 w-40 rounded-full origin-center"
          style={{ background: winner ? `linear-gradient(90deg, ${winner.teamColor}, transparent)` : '#3B82F6' }}
        />
      </motion.div>

      {/* podium */}
      <div className="relative z-10 flex w-full max-w-3xl items-end justify-center gap-3 mb-10">
        {podiumOrder.map((s, i) =>
          s ? (
            <PodiumBlock
              key={s.teamId}
              score={s}
              position={podiumPositions[i] ?? i}
              delay={0.3 + i * 0.15}
            />
          ) : null
        )}
      </div>

      {/* stage floor */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 h-2 w-full max-w-3xl rounded-full origin-center mb-8"
        style={{
          background: winner
            ? `linear-gradient(90deg, transparent, ${winner.teamColor}60, transparent)`
            : 'rgba(255,255,255,0.08)',
        }}
      />

      {/* 4th+ list */}
      {rest.length > 0 && (
        <div className="relative z-10 flex flex-wrap justify-center gap-3 mb-8">
          {rest.map((s, i) => (
            <motion.div
              key={s.teamId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 + i * 0.08 }}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2"
            >
              <span className="text-white/40 text-sm">#{s.rank}</span>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.teamColor }} />
              <span className="text-sm text-white">{s.teamName}</span>
              <span className="text-white/60 font-bold tabular-nums">{s.score}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* audience top 3 */}
      {audienceLeaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="relative z-10 w-full max-w-md"
        >
          <p className="text-center text-xs font-bold tracking-widest uppercase text-[#F59E0B] mb-3">
            Audience Leaderboard
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {audienceLeaderboard.slice(0, 5).map((a) => (
              <div
                key={a.memberId}
                className="flex items-center gap-2 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-3 py-2"
              >
                <span className="text-[#F59E0B] text-sm font-bold">#{a.rank}</span>
                <span className="text-sm text-white">{a.nickname}</span>
                <span className="text-[#F59E0B] font-bold tabular-nums text-sm">{a.totalPoints}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
