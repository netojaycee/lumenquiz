'use client'
import { useParams, usePathname } from 'next/navigation'

/**
 * Returns the current [quizId] route param.
 *
 * In a Next.js static export, useParams() may return '_' (the build-time
 * placeholder) before the client router has fully hydrated with the real URL.
 * usePathname() is reactive and always reflects the live URL, so it's used as
 * the fallback instead of window.location (which is a stale snapshot during
 * client-side navigation and causes loadQuiz to never fire).
 */
export function useQuizId(): string {
  const params = useParams()
  const pathname = usePathname()
  const paramId = params.quizId as string | undefined ?? ''

  if (paramId && paramId !== '_') return paramId

  const match = pathname?.match(/\/host\/quiz\/([^/]+)/)
  const id = match?.[1] ?? ''
  if (id && id !== '_') return id

  return paramId
}
