'use client'
import { motion } from 'framer-motion'
import type { TeamScore } from '@apoquiz/shared-types'
import { ConfettiCanvas } from './ConfettiCanvas'
import { getBaseUrl } from '@/lib/api'

// ─── Trophy SVG ───────────────────────────────────────────────────────────────

function TrophySVG({ color }: { color: string }) {
  return (
    <svg width="140" height="160" viewBox="0 0 140 160" fill="none">
      <defs>
        <linearGradient id="trophy-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <filter id="trophy-glow">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* glow */}
      <ellipse cx="70" cy="80" rx="50" ry="55" fill={color} opacity="0.2" filter="url(#trophy-glow)" />
      {/* cup */}
      <path d="M45 20 L95 20 L90 75 Q70 90 50 75 Z" fill="url(#trophy-grad)" />
      {/* handles */}
      <path d="M45 35 Q20 35 20 55 Q20 70 45 68" stroke="#FFD700" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M95 35 Q120 35 120 55 Q120 70 95 68" stroke="#FFD700" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* stem */}
      <rect x="60" y="75" width="20" height="30" fill="#B8860B" rx="2" />
      {/* base */}
      <rect x="45" y="105" width="50" height="12" fill="url(#trophy-grad)" rx="4" />
      <rect x="40" y="117" width="60" height="8" fill="#B8860B" rx="4" />
      {/* star in cup */}
      <text x="70" y="58" textAnchor="middle" fontSize="22" fill="rgba(255,255,255,0.6)">★</text>
    </svg>
  )
}

// ─── PlayerAvatar (same as in RoundIntroScreen — inline to keep component self-contained) ──

function nameToHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

function PlayerAvatar({ name, size = 56, avatarUrl }: { name: string; size?: number; avatarUrl?: string }) {
  if (avatarUrl) {
    const src = avatarUrl.startsWith('/') ? `${getBaseUrl()}${avatarUrl}` : avatarUrl
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  const hue = nameToHue(name)
  const initials = name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <radialGradient id={`wbg-${name}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={`hsl(${hue},70%,65%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360},60%,35%)`} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill={`hsl(${hue},60%,40%)`} opacity="0.25" />
      <circle cx="28" cy="28" r="24" fill={`url(#wbg-${name})`} />
      <circle cx="28" cy="22" r="8" fill="rgba(255,255,255,0.30)" />
      <path d="M12 48 Q12 36 28 36 Q44 36 44 48" fill="rgba(255,255,255,0.20)" />
      <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="800"
        fontFamily="system-ui,sans-serif" fill="white">{initials}</text>
    </svg>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WinnerScreenProps {
  finalScores: TeamScore[]
  audienceWinner?: { nickname: string; totalPoints: number }
  audienceStats?: { accuracyPercentage: number }
}

export function WinnerScreen({ finalScores, audienceWinner }: WinnerScreenProps) {
  const winner = finalScores[0]
  if (!winner) return null
  const runnerUps = finalScores.slice(1, 3)

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0F0F13] px-8">
      <ConfettiCanvas color={winner.teamColor} />

      {/* dramatic radial spotlight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 50% 40%, ${winner.teamColor}28 0%, transparent 65%)`,
        }}
      />

      {/* top flare lines */}
      {[30, 45, 60, 75, 50].map((deg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 0.08, scaleY: 1 }}
          transition={{ delay: 0.3 + i * 0.08, duration: 0.8 }}
          className="pointer-events-none absolute top-0 left-1/2 h-full w-px origin-top bg-white"
          style={{ transform: `translateX(-50%) rotate(${deg - 90 + i * 15}deg)` }}
        />
      ))}

      {/* CHAMPION text */}
      <motion.p
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-sm font-bold tracking-[0.4em] uppercase mb-4"
        style={{ color: winner.teamColor }}
      >
        ★ Champion ★
      </motion.p>

      {/* Trophy */}
      <motion.div
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 60, damping: 12, delay: 0.2 }}
        className="relative z-10 mb-4"
      >
        <TrophySVG color={winner.teamColor} />
      </motion.div>

      {/* Winner team name */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.7, letterSpacing: '0.5em' }}
        animate={{ opacity: 1, scale: 1, letterSpacing: '0.05em' }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 70 }}
        className="relative z-10 text-7xl font-black text-white text-center mb-1"
        style={{ textShadow: `0 0 40px ${winner.teamColor}88` }}
      >
        {winner.teamName}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="relative z-10 text-2xl font-bold mb-2"
        style={{ color: winner.teamColor }}
      >
        WINS! 🎉
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="relative z-10 text-4xl font-black text-white/60 mb-8 tabular-nums"
      >
        {winner.score} pts
      </motion.p>

      {/* Winner members */}
      {(winner.members ?? []).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="relative z-10 flex gap-4 mb-10"
        >
          {(winner.members ?? []).map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.3 + i * 0.1, type: 'spring', stiffness: 180 }}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="rounded-full p-1"
                style={{ boxShadow: `0 0 14px ${winner.teamColor}88`, border: `2px solid ${winner.teamColor}` }}
              >
                <PlayerAvatar name={m.name} size={60} avatarUrl={m.avatarUrl} />
              </div>
              <span className="text-xs font-bold text-white/70">{m.name.split(' ')[0]}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Runner ups */}
      {runnerUps.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="relative z-10 flex gap-4 mb-8"
        >
          {runnerUps.map((s, i) => (
            <motion.div
              key={s.teamId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 + i * 0.12 }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4"
            >
              <span className="text-2xl">{i === 0 ? '🥈' : '🥉'}</span>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.teamColor }} />
                <span className="text-sm font-bold text-white">{s.teamName}</span>
              </div>
              <span className="text-white/50 font-bold tabular-nums">{s.score}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Audience champion */}
      {audienceWinner && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8 }}
          className="relative z-10 flex items-center gap-4 rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-8 py-4"
        >
          <span className="text-3xl">👑</span>
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-[#F59E0B]">
              Audience Champion
            </p>
            <p className="text-xl font-black text-white">{audienceWinner.nickname}</p>
          </div>
          <span className="text-2xl font-black text-[#F59E0B] tabular-nums ml-4">
            {audienceWinner.totalPoints} pts
          </span>
        </motion.div>
      )}
    </div>
  )
}
