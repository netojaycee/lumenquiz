import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}


type RouteParams = {
  quizId?: string | null
  teamId?: string | null
  liveId?: string | null
  role?: string | null
  section?: string | null
}

export function parseAppRoute(): RouteParams {
  if (typeof window === 'undefined') return {}

  const parts = window.location.pathname
    .split('/')
    .filter(Boolean)

  // TEAM: /team/:id
  if (parts[0] === 'team') {
    return {
      teamId: parts[1] ?? null,
    }
  }

  // AUDIENCE: /audience/:id
  if (parts[0] === 'audience') {
    return {
      teamId: parts[1] ?? null,
      role: 'audience',
    }
  }

  // SCREEN: /screen/:id
  if (parts[0] === 'screen') {
    return {
      liveId: parts[1] ?? null,
      role: 'screen',
    }
  }

  // MODERATOR: /moderator/:id
  if (parts[0] === 'moderator') {
    return {
      liveId: parts[1] ?? null,
      role: 'moderator',
    }
  }

  // HOST LIVE: /host/live/:id
  if (parts[0] === 'host' && parts[1] === 'live') {
    return {
      liveId: parts[2] ?? null,
      role: 'host-live',
    }
  }

  // HOST QUIZ (your main case)
  if (parts[0] === 'host' && parts[1] === 'quiz') {
    return {
      quizId: parts[2] ?? null,
      section: parts[3] ?? null, // teams | rounds | questions | settings
      role: 'host',
    }
  }

  return {}
}