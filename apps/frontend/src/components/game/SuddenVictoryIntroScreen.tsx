'use client'
import { motion } from 'framer-motion'

interface TeamMeta {
  teamId: string
  teamName: string
  teamColor: string
  score: number
}

interface SuddenVictoryIntroScreenProps {
  tiedTeams: TeamMeta[]
}

export function SuddenVictoryIntroScreen({ tiedTeams }: SuddenVictoryIntroScreenProps) {
  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#0A0005]">
      {/* Pulsing red radial background */}
      <motion.div
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(239,68,68,0.18) 0%, transparent 70%)' }}
      />

      {/* Lightning bolt rays */}
      {[-40, -20, 0, 20, 40].map((deg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.06, 0] }}
          transition={{ delay: i * 0.15, repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="pointer-events-none absolute top-0 left-1/2 h-full w-px origin-top bg-red-400"
          style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 60, damping: 12 }}
          className="text-8xl"
        >
          ⚡
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-black tracking-[0.6em] uppercase text-red-400/60">
            Tiebreaker
          </p>
          <h1
            className="font-black leading-none text-white"
            style={{
              fontSize: 'clamp(4rem, 9vw, 8rem)',
              textShadow: '0 0 60px rgba(239,68,68,0.5)',
            }}
          >
            Sudden Victory
          </h1>
        </motion.div>

        {/* Rule card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl border border-red-500/25 bg-red-500/10 px-8 py-4"
        >
          <p className="text-lg font-bold text-white/80">
            One question · First correct answer wins
          </p>
          <p className="text-white/35 text-sm mt-1">
            If all correct, fastest response time decides
          </p>
        </motion.div>

        {/* Tied teams */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85 }}
          className="flex flex-col gap-3 w-full max-w-xl"
        >
          <p className="text-[9px] font-black tracking-[0.4em] uppercase text-white/25 mb-1">
            Competing Teams
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {tiedTeams.map((t, i) => (
              <motion.div
                key={t.teamId}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 + i * 0.12, type: 'spring', stiffness: 200 }}
                className="flex items-center gap-3 rounded-xl border px-5 py-3"
                style={{ borderColor: `${t.teamColor}60`, backgroundColor: `${t.teamColor}12` }}
              >
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: t.teamColor, boxShadow: `0 0 10px ${t.teamColor}` }} />
                <span className="font-black text-white text-lg">{t.teamName}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: t.teamColor }}>{t.score} pts</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Stand by */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 1.5, repeat: Infinity, duration: 1.8 }}
          className="text-red-400/60 text-sm font-black tracking-[0.3em] uppercase"
        >
          Stand by…
        </motion.div>
      </div>
    </div>
  )
}
