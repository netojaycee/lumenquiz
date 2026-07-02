'use client'
import { motion } from 'framer-motion'
import type { TeamScore } from '@apoquiz/shared-types'
import { ConfettiCanvas } from './ConfettiCanvas'
import { getBaseUrl } from '@/lib/api'

// ─── Trophy SVG ───────────────────────────────────────────────────────────────

function TrophySVG({ color, size = 140 }: { color: string; size?: number }) {
  const h = (size / 140) * 160
  return (
    <svg width={size} height={h} viewBox="0 0 140 160" fill="none">
      <defs>
        <linearGradient id="trophy-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <filter id="trophy-glow">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <ellipse cx="70" cy="80" rx="55" ry="60" fill={color} opacity="0.22" filter="url(#trophy-glow)" />
      <path d="M45 20 L95 20 L90 75 Q70 90 50 75 Z" fill="url(#trophy-grad)" />
      <path d="M45 35 Q20 35 20 55 Q20 70 45 68" stroke="#FFD700" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M95 35 Q120 35 120 55 Q120 70 95 68" stroke="#FFD700" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="60" y="75" width="20" height="30" fill="#B8860B" rx="2" />
      <rect x="45" y="105" width="50" height="12" fill="url(#trophy-grad)" rx="4" />
      <rect x="40" y="117" width="60" height="8" fill="#B8860B" rx="4" />
      <text x="70" y="58" textAnchor="middle" fontSize="22" fill="rgba(255,255,255,0.65)">★</text>
    </svg>
  )
}

function PlayerAvatar({ name, size = 52, avatarUrl }: { name: string; size?: number; avatarUrl?: string }) {
  if (avatarUrl) {
    const src = avatarUrl.startsWith('/') ? `${getBaseUrl()}${avatarUrl}` : avatarUrl
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  const initials = name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <radialGradient id={`wbg-${name}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={`hsl(${h},70%,65%)`} />
          <stop offset="100%" stopColor={`hsl(${(h + 40) % 360},60%,35%)`} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill={`hsl(${h},60%,40%)`} opacity="0.25" />
      <circle cx="28" cy="28" r="24" fill={`url(#wbg-${name})`} />
      <circle cx="28" cy="22" r="8" fill="rgba(255,255,255,0.30)" />
      <path d="M12 48 Q12 36 28 36 Q44 36 44 48" fill="rgba(255,255,255,0.20)" />
      <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="800"
        fontFamily="system-ui,sans-serif" fill="white">{initials}</text>
    </svg>
  )
}

interface WinnerScreenProps {
  finalScores: TeamScore[]
  audienceWinner?: { nickname: string; totalPoints: number }
  audienceStats?: { accuracyPercentage: number }
}

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4th', '5th', '6th', '7th', '8th']

export function WinnerScreen({ finalScores, audienceWinner }: WinnerScreenProps) {
  const winner = finalScores[0]
  if (!winner) return null

  // 2nd place and beyond
  const others = finalScores.slice(1)

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#0A0A0F]">
      <ConfettiCanvas color={winner.teamColor} />

      {/* Winner radial spotlight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.8 }}
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 65% 80% at 35% 50%, ${winner.teamColor}28 0%, transparent 65%)`,
        }}
      />

      {/* Rotating light rays behind winner */}
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.055 }}
          transition={{ delay: 0.4 + i * 0.06, duration: 1 }}
          className="pointer-events-none absolute top-1/2 left-[35%] h-[200vh] w-px origin-top bg-white"
          style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
        />
      ))}

      {/* ── Main layout: winner LEFT | others + audience RIGHT ── */}
      <div className="relative z-10 flex h-full gap-0">

        {/* ═══ LEFT: Champion (55% width) ═══ */}
        <div className="flex w-[55%] flex-col items-center justify-center gap-4 px-10">
          {/* Champion label */}
          <motion.p
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xs font-black tracking-[0.45em] uppercase"
            style={{ color: winner.teamColor }}
          >
            ★ Champion ★
          </motion.p>

          {/* Trophy */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 55, damping: 12, delay: 0.2 }}
          >
            <TrophySVG color={winner.teamColor} size={130} />
          </motion.div>

          {/* Winner name */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45, type: 'spring', stiffness: 65 }}
            className="text-center font-black text-white leading-none"
            style={{
              fontSize: 'clamp(3rem, 6vw, 5.5rem)',
              textShadow: `0 0 50px ${winner.teamColor}88`,
            }}
          >
            {winner.teamName}
          </motion.h1>

          {/* WINS + score */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75 }}
            className="flex items-baseline gap-3"
          >
            <span className="text-3xl font-black" style={{ color: winner.teamColor }}>
              WINS! 🎉
            </span>
            <span className="text-2xl font-black text-white/40 tabular-nums">
              {winner.score} pts
            </span>
          </motion.div>

          {/* Winner members */}
          {(winner.members ?? []).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="flex flex-wrap justify-center gap-3"
            >
              {(winner.members ?? []).map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.1 + i * 0.08, type: 'spring', stiffness: 180 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="rounded-full p-0.5"
                    style={{ boxShadow: `0 0 14px ${winner.teamColor}88`, border: `2px solid ${winner.teamColor}` }}
                  >
                    <PlayerAvatar name={m.name} size={52} avatarUrl={m.avatarUrl} />
                  </div>
                  <span className="text-[11px] font-bold text-white/60">{m.name.split(' ')[0]}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ═══ RIGHT: Others + audience (45% width) ═══ */}
        <div className="flex w-[45%] flex-col justify-center gap-4 border-l border-white/[0.05] px-10 py-8">

          {/* 2nd, 3rd, … N */}
          {others.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-1">
                Final Standings
              </p>
              {others.map((s, i) => (
                <motion.div
                  key={s.teamId}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 + i * 0.1, type: 'spring', stiffness: 70 }}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
                >
                  <span className="w-8 flex-shrink-0 text-center text-xl">
                    {RANK_MEDALS[i + 1] ?? `#${i + 2}`}
                  </span>
                  <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: s.teamColor }} />
                  <span className="flex-1 truncate font-black text-white">{s.teamName}</span>
                  {(s.members ?? []).length > 0 && (
                    <div className="flex -space-x-1.5">
                      {(s.members ?? []).slice(0, 3).map((m) => (
                        <div key={m.id} className="rounded-full ring-1 ring-[#0A0A0F]">
                          <PlayerAvatar name={m.name} size={24} avatarUrl={m.avatarUrl} />
                        </div>
                      ))}
                    </div>
                  )}
                  <span className="font-black tabular-nums text-sm flex-shrink-0" style={{ color: s.teamColor }}>
                    {s.score}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Divider */}
          {audienceWinner && others.length > 0 && (
            <div className="h-px bg-white/[0.06] my-1" />
          )}

          {/* Audience champion */}
          {audienceWinner && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8 }}
              className="flex flex-col gap-3 rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.07] p-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#F59E0B] text-[9px] font-black uppercase tracking-[0.35em]">
                  Audience Champion
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-4xl">👑</span>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-black text-white truncate">{audienceWinner.nickname}</p>
                  <p className="text-[#F59E0B] font-bold tabular-nums">{audienceWinner.totalPoints} pts</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
