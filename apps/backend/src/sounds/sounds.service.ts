import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

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

const SOUND_KEYS = Object.keys(DEFAULT_SOUND_MAP) as SoundKey[]

@Injectable()
export class SoundsService {
  private readonly logger = new Logger(SoundsService.name)
  private readonly dataDir: string
  private readonly configPath: string
  private customKeys: Set<SoundKey> = new Set()

  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data', 'sounds')
    this.configPath = path.join(this.dataDir, 'config.json')
    this.ensureDataDir()
    this.loadConfig()
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  private loadConfig(): void {
    if (!fs.existsSync(this.configPath)) return
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8')
      const keys: SoundKey[] = JSON.parse(raw)
      this.customKeys = new Set(keys.filter((k) => SOUND_KEYS.includes(k)))
    } catch {
      this.logger.warn('Could not parse sounds config, resetting')
      this.customKeys = new Set()
    }
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify([...this.customKeys]), 'utf-8')
  }

  getConfig(): Record<SoundKey, string> {
    const config = {} as Record<SoundKey, string>
    for (const key of SOUND_KEYS) {
      config[key] = this.customKeys.has(key)
        ? `/api/sounds/file/${key}`
        : DEFAULT_SOUND_MAP[key]
    }
    return config
  }

  isValidKey(key: string): key is SoundKey {
    return SOUND_KEYS.includes(key as SoundKey)
  }

  saveSound(key: SoundKey, buffer: Buffer, originalName: string): void {
    const ext = path.extname(originalName).toLowerCase() || '.mp3'
    const dest = path.join(this.dataDir, `${key}${ext}`)

    // Remove any existing file for this key (different extension)
    for (const f of fs.readdirSync(this.dataDir)) {
      const base = path.basename(f, path.extname(f))
      if (base === key && f !== 'config.json') {
        fs.unlinkSync(path.join(this.dataDir, f))
      }
    }

    fs.writeFileSync(dest, buffer)
    this.customKeys.add(key)
    this.saveConfig()
  }

  resetSound(key: SoundKey): void {
    if (!this.customKeys.has(key)) return

    for (const f of fs.readdirSync(this.dataDir)) {
      const base = path.basename(f, path.extname(f))
      if (base === key && f !== 'config.json') {
        fs.unlinkSync(path.join(this.dataDir, f))
      }
    }

    this.customKeys.delete(key)
    this.saveConfig()
  }

  getCustomFilePath(key: SoundKey): string | null {
    if (!this.customKeys.has(key)) return null
    for (const f of fs.readdirSync(this.dataDir)) {
      const base = path.basename(f, path.extname(f))
      if (base === key && f !== 'config.json') {
        return path.join(this.dataDir, f)
      }
    }
    return null
  }
}
