'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { TeamScore } from '@apoquiz/shared-types'
import { getBaseUrl } from '@/lib/api'

// ─── Deterministic avatar colour from name ────────────────────────────────────

function nameToHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

// ─── Player avatar SVG ────────────────────────────────────────────────────────

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
  const initials = name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')

  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <radialGradient id={`bg-${name}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={`hsl(${hue},70%,65%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360},60%,35%)`} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill={`hsl(${hue},60%,40%)`} opacity="0.25" />
      <circle cx="28" cy="28" r="24" fill={`url(#bg-${name})`} />
      <circle cx="28" cy="22" r="8" fill="rgba(255,255,255,0.30)" />
      <path d="M12 48 Q12 36 28 36 Q44 36 44 48" fill="rgba(255,255,255,0.20)" />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        fill="white"
      >
        {initials}
      </text>
    </svg>
  )
}

// ─── Shield / crest vector per team ──────────────────────────────────────────

function TeamShield({ color, size = 120 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 120 138" fill="none">
      <defs>
        <linearGradient id={`shield-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* glow */}
      <path
        d="M60 4 L108 24 L108 70 Q108 112 60 134 Q12 112 12 70 L12 24 Z"
        fill={color}
        opacity="0.18"
        filter="url(#glow)"
      />
      {/* main shield */}
      <path
        d="M60 8 L104 26 L104 70 Q104 108 60 130 Q16 108 16 70 L16 26 Z"
        fill={`url(#shield-${color})`}
        stroke={color}
        strokeWidth="2"
        strokeOpacity="0.7"
      />
      {/* inner decoration lines */}
      <path
        d="M60 20 L96 34 L96 68 Q96 100 60 118 Q24 100 24 68 L24 34 Z"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      {/* cross motif */}
      <line x1="60" y1="38" x2="60" y2="96" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
      <line x1="36" y1="62" x2="84" y2="62" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
    </svg>
  )
}

// ─── Particle burst (SVG lines radiating from centre) ────────────────────────

function BurstParticles({ color }: { color: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => (i * 360) / 12)
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ width: '100%', height: '100%' }}
    >
      {rays.map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const x1 = 50 + Math.cos(rad) * 8
        const y1 = 50 + Math.sin(rad) * 8
        const x2 = 50 + Math.cos(rad) * 45
        const y2 = 50 + Math.sin(rad) * 45
        return (
          <motion.line
            key={i}
            x1={`${x1}%`} y1={`${y1}%`}
            x2={`${x1}%`} y2={`${y1}%`}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={0.7}
            animate={{ x2: `${x2}%`, y2: `${y2}%`, opacity: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: 'easeOut' }}
          />
        )
      })}
    </svg>
  )
}

// ─── Single team card ─────────────────────────────────────────────────────────

function TeamCard({ team, delay }: { team: TeamScore; delay: number }) {
  const [burst, setBurst] = useState(false)
  const members = team.members ?? []

  useEffect(() => {
    const t = setTimeout(() => setBurst(true), delay * 1000 + 600)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 55, damping: 14 }}
      className="relative flex flex-col items-center gap-5"
    >
      {/* burst particles on entry */}
      {burst && <BurstParticles color={team.teamColor} />}

      {/* Shield */}
      <motion.div
        animate={{ rotate: [0, -4, 4, -2, 0] }}
        transition={{ delay: delay + 0.5, duration: 0.6, ease: 'easeInOut' }}
      >
        <TeamShield color={team.teamColor} size={110} />
      </motion.div>

      {/* Team name */}
      <motion.h2
        initial={{ opacity: 0, letterSpacing: '0.5em' }}
        animate={{ opacity: 1, letterSpacing: '0.08em' }}
        transition={{ delay: delay + 0.3, duration: 0.5 }}
        className="text-3xl font-black tracking-wide text-white drop-shadow-lg"
        style={{ textShadow: `0 0 24px ${team.teamColor}88` }}
      >
        {team.teamName.toUpperCase()}
      </motion.h2>

      {/* VS divider line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: delay + 0.45, duration: 0.4 }}
        className="h-px w-24 origin-left"
        style={{ backgroundColor: team.teamColor, opacity: 0.5 }}
      />

      {/* Members */}
      {members.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {members.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.5 + i * 0.1, type: 'spring', stiffness: 180 }}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="rounded-full p-0.5"
                style={{ boxShadow: `0 0 10px ${team.teamColor}66`, border: `2px solid ${team.teamColor}` }}
              >
                <PlayerAvatar name={m.name} size={52} avatarUrl={m.avatarUrl} />
              </div>
              <span className="text-xs font-semibold text-white/80 tracking-wide">
                {m.name.split(' ')[0]}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── VS badge between teams ───────────────────────────────────────────────────

function VsBadge({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 80 }}
      className="flex flex-col items-center justify-center self-center"
    >
      <div className="relative">
        {/* pulsing glow */}
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full bg-white/20"
        />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
          <span className="text-xl font-black text-white/70 tracking-tighter">VS</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Background: animated grid + radial glow ─────────────────────────────────

function AnimatedBackground({ teams }: { teams: TeamScore[] }) {
  const colors = teams.map((t) => t.teamColor)
  // Spread radial gradients evenly across width for any number of teams
  const gradients = colors
    .map((c, i) => {
      const pct = colors.length === 1 ? 50 : (i / (colors.length - 1)) * 80 + 10
      return `radial-gradient(ellipse 50% 70% at ${pct}% 50%, ${c}20 0%, transparent 65%)`
    })
    .join(', ')
  const lineGradient = `linear-gradient(90deg, ${colors.join(', ')})`

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0"
        style={{ background: gradients }}
      />
      <motion.div
        animate={{ backgroundPositionX: ['0%', '100%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        className="absolute top-0 left-0 h-px w-full origin-left"
        style={{ background: lineGradient }}
      />
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.8, delay: 0.2, ease: 'easeOut' }}
        className="absolute bottom-0 left-0 h-px w-full origin-right"
        style={{ background: lineGradient }}
      />
    </div>
  )
}

// ─── Round countdown badge ────────────────────────────────────────────────────

function RoundBadge({ roundName, roundOrder }: { roundName?: string; roundOrder?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, type: 'spring', stiffness: 80 }}
      className="flex flex-col items-center gap-1"
    >
      <p className="text-sm font-bold tracking-[0.25em] uppercase text-white/40">Now Starting</p>
      <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-2xl">
        {roundName ?? `Round ${roundOrder ?? ''}`}
      </h1>
      {/* animated underline */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="mt-1 h-1 w-32 rounded-full origin-center"
        style={{ background: 'linear-gradient(90deg, #3B82F6, #a855f7)' }}
      />
    </motion.div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

interface RoundIntroScreenProps {
  teams: TeamScore[]
  roundName?: string
  roundOrder?: number
}

export function RoundIntroScreen({ teams, roundName, roundOrder }: RoundIntroScreenProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-[#0F0F13] py-10 px-8">
      <AnimatedBackground teams={teams} />

      {/* round label */}
      <RoundBadge roundName={roundName} roundOrder={roundOrder} />

      {/* Teams — row for ≤3, 2-col grid for 4+ */}
      {teams.length <= 3 ? (
        <div className="relative z-10 flex w-full max-w-6xl items-start justify-around gap-4">
          {teams.map((team, i) => (
            <div key={team.teamId} className="flex items-start gap-4">
              <TeamCard team={team} delay={0.3 + i * 0.4} />
              {i < teams.length - 1 && <VsBadge delay={0.6 + i * 0.4} />}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="relative z-10 grid w-full max-w-5xl gap-6"
          style={{ gridTemplateColumns: `repeat(${Math.min(teams.length, 4)}, 1fr)` }}
        >
          {teams.map((team, i) => (
            <TeamCard key={team.teamId} team={team} delay={0.2 + i * 0.25} />
          ))}
        </div>
      )}

      {/* bottom "get ready" pulse */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ delay: 1.8, duration: 1.2, repeat: Infinity, repeatDelay: 0.4 }}
        className="text-sm font-bold tracking-[0.3em] uppercase text-white/40"
      >
        Get Ready…
      </motion.p>
    </div>
  )
}
