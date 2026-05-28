'use client'
import { motion } from 'framer-motion'
import type { TeamScore } from '@apoquiz/shared-types'

interface GoodbyeScreenProps {
  winner?: TeamScore
}

const FAREWELLS = [
  'See you next time!',
  'Until the next challenge!',
  'May the best team win… next time!',
  'Thanks for playing!',
  'God bless, and see you soon!',
]

// Animated star field
function StarField() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 2.5,
    delay: Math.random() * 3,
    dur: 2 + Math.random() * 3,
  }))

  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.1, 0.8, 0.1] }}
          transition={{ delay: s.delay, duration: s.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

// Cross / dove vector
function DoveSVG() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" opacity="0.15">
      <path
        d="M60 40 C40 20 10 25 5 40 C10 55 40 45 60 40 Z"
        fill="white"
      />
      <path
        d="M60 40 C80 20 110 25 115 40 C110 55 80 45 60 40 Z"
        fill="white"
      />
      <ellipse cx="60" cy="38" rx="8" ry="6" fill="white" />
      <path d="M60 38 L60 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function GoodbyeScreen({ winner }: GoodbyeScreenProps) {
  const farewell = FAREWELLS[Math.floor(Math.random() * FAREWELLS.length)]!

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#08080E] px-8">
      <StarField />

      {/* soft glow centre */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          className="h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)' }}
        />
      </motion.div>

      {/* dove / peace ornament */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1.2 }}
        className="relative z-10 mb-6"
      >
        <DoveSVG />
      </motion.div>

      {/* Apoquiz wordmark */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 60 }}
        className="relative z-10 text-7xl font-black text-white tracking-tight mb-3"
      >
        APO<span className="text-[#3B82F6]">QUIZ</span>
      </motion.h1>

      {/* divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.7, duration: 0.8 }}
        className="relative z-10 h-px w-64 origin-center mb-6 bg-white/10"
      />

      {winner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="relative z-10 mb-6 flex items-center gap-3 text-xl text-white/60"
        >
          <span>🏆</span>
          <span>
            Congratulations to{' '}
            <span className="font-bold" style={{ color: winner.teamColor }}>
              {winner.teamName}
            </span>
          </span>
        </motion.div>
      )}

      {/* farewell message */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="relative z-10 text-3xl font-bold text-white/70 text-center mb-10"
      >
        {farewell}
      </motion.p>

      {/* animated cross */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 1.2 }}
        className="relative z-10"
      >
        <svg width="40" height="50" viewBox="0 0 40 50" fill="none">
          <motion.rect
            x="17" y="0" width="6" height="50" rx="3"
            fill="rgba(255,255,255,0.15)"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            style={{ originY: '0%' }}
            transition={{ delay: 1.4, duration: 0.6 }}
          />
          <motion.rect
            x="0" y="14" width="40" height="6" rx="3"
            fill="rgba(255,255,255,0.15)"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ originX: '50%' }}
            transition={{ delay: 1.8, duration: 0.5 }}
          />
        </svg>
      </motion.div>

      {/* pulsing year / branding */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0.3] }}
        transition={{ delay: 2, duration: 1.5 }}
        className="relative z-10 mt-10 text-xs font-medium tracking-[0.3em] uppercase text-white/20"
      >
        Live Bible Quiz Platform
      </motion.p>
    </div>
  )
}
