'use client'
// Static import is safe here — 'use client' ensures this module never runs on the server.
// Dynamic import + async init() caused a race: sounds fired before the import resolved
// would silently no-op because this.sounds was still empty.
import { Howl, Howler } from 'howler'
import { getBaseUrl } from './api'

export type SoundKey =
  | 'roundIntro' | 'questionReveal' | 'tick' | 'timeWarning'
  | 'timeUp' | 'correct' | 'wrong' | 'scoreUpdate' | 'rankChange'
  | 'roundEnd' | 'newLeader' | 'quizEnd' | 'winner' | 'drumRoll'
  | 'audienceBonus' | 'emojiPop'

const DEFAULT_SOUND_MAP: Record<SoundKey, string> = {
  roundIntro:     '/sounds/round-intro.mp3',
  questionReveal: '/sounds/question-reveal.mp3',
  tick:           '/sounds/tick.mp3',
  timeWarning:    '/sounds/time-warning.mp3',
  timeUp:         '/sounds/time-up.mp3',
  correct:        '/sounds/correct.mp3',
  wrong:          '/sounds/wrong.mp3',
  scoreUpdate:    '/sounds/score-update.mp3',
  rankChange:     '/sounds/rank-change.mp3',
  roundEnd:       '/sounds/round-end.mp3',
  newLeader:      '/sounds/new-leader.mp3',
  quizEnd:        '/sounds/quiz-end.mp3',
  winner:         '/sounds/winner.mp3',
  drumRoll:       '/sounds/drum-roll.mp3',
  audienceBonus:  '/sounds/audience-bonus.mp3',
  emojiPop:       '/sounds/emoji-pop.mp3',
}

class SoundManager {
  private sounds: Partial<Record<SoundKey, Howl>> = {}
  private initialized = false
  private tickHandle: ReturnType<typeof setTimeout> | null = null
  private soundUrls: Record<SoundKey, string> = { ...DEFAULT_SOUND_MAP }

  // Fetch custom sound config from backend, then init.
  // Falls back to defaults silently if fetch fails.
  async initWithRemoteConfig(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return
    try {
      const res = await fetch(`${getBaseUrl()}/api/sounds/config`, { credentials: 'include' })
      if (res.ok) {
        const config = await res.json() as Record<SoundKey, string>
        // Backend returns absolute paths for custom keys (/api/sounds/file/:key)
        // and static-relative paths for defaults (/sounds/xxx.mp3).
        // Prefix the backend base URL only for custom (api) paths.
        for (const [key, url] of Object.entries(config) as [SoundKey, string][]) {
          this.soundUrls[key] = url.startsWith('/api/')
            ? `${getBaseUrl()}${url}`
            : url
        }
      }
    } catch {
      // Use defaults
    }
    this.init()
  }

  // Synchronous init with current soundUrls — call once on first user interaction.
  init(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true
    Howler.volume(1)
    for (const [key, src] of Object.entries(this.soundUrls) as [SoundKey, string][]) {
      this.sounds[key] = new Howl({
        src: [src],
        loop: key === 'tick',
        preload: true,
        html5: false,
        onloaderror: () => undefined,
      })
    }
  }

  // Reload a single sound (called after upload/reset in settings).
  reloadSound(key: SoundKey, url: string): void {
    const fullUrl = url.startsWith('/api/') ? `${getBaseUrl()}${url}` : url
    this.soundUrls[key] = fullUrl
    this.sounds[key]?.unload()
    this.sounds[key] = new Howl({
      src: [fullUrl],
      loop: key === 'tick',
      preload: true,
      html5: false,
      onloaderror: () => undefined,
    })
  }

  play(key: SoundKey): void {
    this.sounds[key]?.play()
  }

  stop(key: SoundKey): void {
    this.sounds[key]?.stop()
  }

  startTick(durationMs: number): void {
    const tick = this.sounds.tick
    if (!tick) return
    tick.rate(1.0)
    tick.play()
    // Speed up tick in the final 5 seconds
    this.tickHandle = setTimeout(() => tick.rate(1.4), Math.max(0, durationMs - 5000))
    setTimeout(() => {
      tick.stop()
      this.play('timeUp')
      this.tickHandle = null
    }, durationMs)
  }

  stopTick(): void {
    if (this.tickHandle) {
      clearTimeout(this.tickHandle)
      this.tickHandle = null
    }
    this.sounds.tick?.stop()
  }
}

export const soundManager = new SoundManager()
export { DEFAULT_SOUND_MAP }
