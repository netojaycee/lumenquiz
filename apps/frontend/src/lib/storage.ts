export interface TeamStorage {
  teamId: string
  sessionId: string
  joinCode: string
  name: string
  color: string
}

export interface AudienceStorage {
  audienceId: string
  sessionId: string
  fullName: string
  fingerprint: string
}

export interface ModeratorStorage {
  sessionId: string
  pin: string
}

const TEAM_KEY = 'Apoquiz_team'
const AUDIENCE_KEY = 'Apoquiz_audience'
const MODERATOR_KEY = 'Apoquiz_moderator'

export const storage = {
  getTeam(): TeamStorage | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(TEAM_KEY)
    return raw ? (JSON.parse(raw) as TeamStorage) : null
  },
  setTeam(data: TeamStorage): void {
    localStorage.setItem(TEAM_KEY, JSON.stringify(data))
  },
  clearTeam(): void {
    localStorage.removeItem(TEAM_KEY)
  },

  getAudience(): AudienceStorage | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(AUDIENCE_KEY)
    return raw ? (JSON.parse(raw) as AudienceStorage) : null
  },
  setAudience(data: AudienceStorage): void {
    localStorage.setItem(AUDIENCE_KEY, JSON.stringify(data))
  },
  clearAudience(): void {
    localStorage.removeItem(AUDIENCE_KEY)
  },

  getModerator(): ModeratorStorage | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(MODERATOR_KEY)
    return raw ? (JSON.parse(raw) as ModeratorStorage) : null
  },
  setModerator(data: ModeratorStorage): void {
    localStorage.setItem(MODERATOR_KEY, JSON.stringify(data))
  },
  clearModerator(): void {
    localStorage.removeItem(MODERATOR_KEY)
  },
}

export function generateFingerprint(): string {
  const ua = navigator.userAgent
  const screen = `${window.screen.width}x${window.screen.height}`
  const ts = Date.now().toString(36)
  const combined = `${ua}|${screen}|${ts}`
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
