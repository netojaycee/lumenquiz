'use client'
import { useEffect, useRef } from 'react'

interface ConfettiCanvasProps {
  color: string
  /** If set, animation stops after this many ms. Omit for continuous. */
  duration?: number
  /** Number of confetti pieces (default 120) */
  count?: number
}

export function ConfettiCanvas({ color, duration, count = 120 }: ConfettiCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pieces = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: 4 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      angle: Math.random() * Math.PI * 2,
      av: (Math.random() - 0.5) * 0.15,
      hue: Math.random() > 0.5 ? color : '#F59E0B',
      alpha: 0.8 + Math.random() * 0.2,
    }))

    const startTime = Date.now()
    let raf: number
    let stopped = false

    const draw = () => {
      if (stopped) return
      if (duration && Date.now() - startTime > duration) {
        stopped = true
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      const elapsed = duration ? (Date.now() - startTime) / duration : 0
      const fadeOut = duration ? Math.max(0, 1 - elapsed * 1.2) : 1

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of pieces) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.globalAlpha = p.alpha * fadeOut
        ctx.fillStyle = p.hue
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r)
        ctx.restore()
        p.x += p.vx
        p.y += p.vy
        p.angle += p.av
        if (p.y > canvas.height) {
          p.y = -20
          p.x = Math.random() * canvas.width
        }
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [color, count, duration])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 w-full h-full" />
}
