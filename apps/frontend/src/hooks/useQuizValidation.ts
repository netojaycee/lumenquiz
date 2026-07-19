import { useMemo } from 'react'
import type { Round } from '@apoquiz/shared-types'

interface QuizForValidation {
  teams?: Array<{ id: string; deletedAt?: string | null }>
  rounds?: Array<
    Round & {
      questions?: Array<{ id: string }>
    }
  >
}

export interface QuizValidationResult {
  warnings: string[]
  canLaunch: boolean
}

// Determines the minimum number of questions a round needs based on game mode.
// Collective modes (blitz, clue_reveal): all teams answer the same questions.
// Per-team modes (tile_blitz, ultimate_challenge): every team gets their own set.
function requiredQuestions(
  gameMode: string,
  questionCount: number,
  teamCount: number,
): { required: number; isPerTeam: boolean } {
  if (gameMode === 'tile_blitz' || gameMode === 'ultimate_challenge') {
    return { required: questionCount * teamCount, isPerTeam: true }
  }
  if (gameMode === 'blitz') {
    return { required: questionCount + 3, isPerTeam: false }
  }
  return { required: questionCount, isPerTeam: false }
}

export function useQuizValidation(quiz: QuizForValidation | null | undefined): QuizValidationResult {
  return useMemo(() => {
    if (!quiz) return { warnings: [], canLaunch: false }

    const teams = (quiz.teams ?? []).filter((t) => !t.deletedAt)
    const rounds = quiz.rounds ?? []
    const teamCount = teams.length
    const warnings: string[] = []

    if (teamCount === 0) warnings.push('No teams added — add at least one team')
    if (rounds.length === 0) warnings.push('No rounds added — add at least one round')

    for (const round of rounds) {
      const actual = round.questions?.length ?? 0
      const needed = round.questionCount
      const label = round.name ?? `Round ${round.order}`
      const mode = round.gameMode

      if (actual === 0) {
        warnings.push(`"${label}" has no questions`)
        continue
      }

      if (teamCount > 0) {
        const { required, isPerTeam } = requiredQuestions(mode, needed, teamCount)
        if (actual < required) {
          if (isPerTeam) {
            warnings.push(
              `"${label}" (${mode.replace(/_/g, ' ')}) needs ${required} questions ` +
              `(${teamCount} teams × ${needed}) — only ${actual} added`,
            )
          } else if (mode === 'blitz') {
            warnings.push(
              `"${label}" (blitz) needs ${required} questions (${needed} for the round + 3 reserve for Sudden Victory) — only ${actual} added`,
            )
          } else {
            warnings.push(
              `"${label}" needs ${needed} question${needed !== 1 ? 's' : ''} — only ${actual} added`,
            )
          }
        }
      }
    }

    return { warnings, canLaunch: warnings.length === 0 }
  }, [quiz])
}
