'use client'
import { useParams, usePathname } from 'next/navigation'

/**
 * Returns the current [sessionId] route param.
 *
 * In a Next.js static export, useParams() may return '_' (the build-time
 * placeholder) before the client router has fully hydrated with the real URL.
 * usePathname() is reactive and always reflects the live URL, so it is used
 * as the fallback (same approach as useQuizId).
 *
 * Works for all [sessionId] routes:
 *   /audience/[sessionId]
 *   /team/[sessionId]
 *   /screen/[sessionId]
 *   /moderator/[sessionId]
 *   /host/live/[sessionId]
 *   /host/results/[sessionId]
 */
export function useSessionId(): string {
  const params  = useParams()
  const pathname = usePathname()
  const paramId  = (params.sessionId as string | undefined) ?? ''

  if (paramId && paramId !== '_') return paramId

  // Session ID is always the last path segment in every route that uses this hook
  const segments = pathname?.split('/').filter(Boolean) ?? []
  const last = segments[segments.length - 1] ?? ''
  if (last && last !== '_') return last

  return paramId
}
