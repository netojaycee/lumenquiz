'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TimerBarProps {
  startTime: number
  durationMs: number
  onElapsed?: () => void
}

export function TimerBar({ startTime, durationMs, onElapsed }: TimerBarProps): React.ReactElement {
  const [pct, setPct] = useState(100)

  useEffect(() => {
    let raf: number
    let done = false

    const tick = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - startTime))
      setPct((remaining / durationMs) * 100)
      if (remaining <= 0 && !done) {
        done = true
        onElapsed?.()
        return
      }
      if (!done) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      done = true
      cancelAnimationFrame(raf)
    }
  }, [startTime, durationMs, onElapsed])

  return (
    <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full',
          pct > 50 ? 'bg-blitz-accent' : pct > 20 ? 'bg-timer-warning' : 'bg-wrong',
        )}
        style={{ width: `${pct}%`, transition: 'width 100ms linear' }}
      />
    </div>
  )
}

export function TimerCountdown({
  startTime,
  durationMs,
}: {
  startTime: number
  durationMs: number
}): React.ReactElement {
  const [remaining, setRemaining] = useState(durationMs)

  useEffect(() => {
    let raf: number
    let done = false

    const tick = () => {
      const rem = Math.max(0, durationMs - (Date.now() - startTime))
      setRemaining(rem)
      if (rem > 0 && !done) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      done = true
      cancelAnimationFrame(raf)
    }
  }, [startTime, durationMs])

  const secs = Math.ceil(remaining / 1000)
  const pct = remaining / durationMs

  return (
    <span
      className={cn(
        'font-mono font-bold tabular-nums',
        pct > 0.5 ? 'text-white' : pct > 0.2 ? 'text-timer-warning' : 'text-wrong',
      )}
    >
      {secs}
    </span>
  )
}
