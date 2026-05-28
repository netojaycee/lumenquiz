'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface TeamAnswer {
  teamId: string
  teamName: string
  teamColor: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
}

interface RevealScore {
  teamId: string
  teamName: string
  teamColor: string
  score: number
  rank: number
}

interface AnswerRevealScreenProps {
  correctAnswer: string
  teamAnswers: TeamAnswer[]
  updatedScores: RevealScore[]
  questionText?: string
}

// ─── Correct burst animation ──────────────────────────────────────────────────

function CorrectBurst({ color }: { color: string }) {
  const rays = Array.from({ length: 8 }, (_, i) => i)
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {rays.map((i) => (
        <motion.div
          key={i}
          initial={{ scaleY: 0, opacity: 1 }}
          animate={{ scaleY: 1, opacity: 0 }}
          transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
          className="absolute w-1 rounded-full origin-bottom"
          style={{
            height: 80,
            backgroundColor: color,
            transform: `rotate(${i * 45}deg) translateY(-50%)`,
            transformOrigin: 'bottom center',
            bottom: '50%',
            left: 'calc(50% - 2px)',
          }}
        />
      ))}
    </div>
  )
}

// ─── Individual team answer card ──────────────────────────────────────────────

function TeamAnswerCard({ answer, index, total }: { answer: TeamAnswer; index: number; total: number }) {
  const isCorrect = answer.isCorrect

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.2 + index * 0.18, type: 'spring', stiffness: 65, damping: 14 }}
      className="relative flex flex-col items-center gap-4 rounded-3xl border-2 overflow-hidden"
      style={{
        borderColor: isCorrect ? answer.teamColor : 'rgba(239,68,68,0.3)',
        background: isCorrect
          ? `linear-gradient(160deg, ${answer.teamColor}18 0%, ${answer.teamColor}08 100%)`
          : 'rgba(239,68,68,0.04)',
        flex: `0 0 calc(${100 / Math.min(total, 4)}% - 16px)`,
        maxWidth: total === 1 ? 480 : undefined,
        minWidth: 180,
        padding: '28px 20px',
      }}
    >
      {/* Top stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: isCorrect ? answer.teamColor : 'rgba(239,68,68,0.4)' }}
      />

      {/* Correct burst effect */}
      {isCorrect && <CorrectBurst color={answer.teamColor} />}

      {/* Team color dot + name */}
      <div className="flex items-center gap-2 z-10">
        <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: answer.teamColor }} />
        <span className="text-base font-black text-white tracking-wide">{answer.teamName}</span>
      </div>

      {/* Answer text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 + index * 0.18 }}
        className="z-10 text-center text-lg italic font-medium leading-tight"
        style={{ color: isCorrect ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)' }}
      >
        &ldquo;{answer.submittedAnswer || '—'}&rdquo;
      </motion.p>

      {/* Result icon */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.55 + index * 0.18, type: 'spring', stiffness: 200, damping: 12 }}
        className="z-10 text-5xl"
      >
        {isCorrect ? '✅' : '❌'}
      </motion.div>

      {/* Points earned */}
      <AnimatePresence>
        {isCorrect && answer.pointsEarned > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + index * 0.18 }}
            className="z-10 rounded-xl px-5 py-1.5 font-black text-xl"
            style={{ backgroundColor: `${answer.teamColor}22`, color: answer.teamColor }}
          >
            +{answer.pointsEarned} pts
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AnswerRevealScreen({ correctAnswer, teamAnswers, updatedScores, questionText }: AnswerRevealScreenProps) {
  const anyCorrect = teamAnswers.some((a) => a.isCorrect)

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0F0F13] p-10">
      {/* Background glow based on result */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="pointer-events-none absolute inset-0"
        style={{
          background: anyCorrect
            ? 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(34,197,94,0.08) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(239,68,68,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Correct answer banner */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 mb-8 flex flex-col items-center gap-2"
      >
        <p className="text-xs font-bold tracking-[0.3em] uppercase text-white/30">Correct Answer</p>
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 80 }}
          className="rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/10 px-8 py-3"
        >
          <span className="text-3xl font-black text-[#22C55E]">{correctAnswer}</span>
        </motion.div>
        {questionText && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mt-1 text-sm text-white/30 text-center max-w-2xl"
          >
            {questionText}
          </motion.p>
        )}
      </motion.div>

      {/* Team answer cards */}
      <div className="relative z-10 flex flex-1 items-center justify-center gap-4 flex-wrap">
        {teamAnswers.map((a, i) => (
          <TeamAnswerCard key={a.teamId} answer={a} index={i} total={teamAnswers.length} />
        ))}
      </div>

      {/* Updated scoreboard strip */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 + teamAnswers.length * 0.18 }}
        className="relative z-10 mt-8 flex justify-center gap-3 flex-wrap"
      >
        {updatedScores
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((s, i) => (
            <motion.div
              key={s.teamId}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.0 + i * 0.08, type: 'spring' }}
              className="flex items-center gap-2 rounded-xl border px-4 py-2"
              style={{
                borderColor: `${s.teamColor}44`,
                backgroundColor: `${s.teamColor}0E`,
              }}
            >
              <span className="text-white/30 text-xs">#{s.rank}</span>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.teamColor }} />
              <span className="text-sm font-bold text-white">{s.teamName}</span>
              <span className="font-black tabular-nums" style={{ color: s.teamColor }}>{s.score}</span>
            </motion.div>
          ))}
      </motion.div>
    </div>
  )
}
