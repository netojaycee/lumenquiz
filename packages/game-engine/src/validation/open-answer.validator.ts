import type { Question, AnswerResult } from '@apoquiz/shared-types'
import { AnswerValidationTier } from '@apoquiz/shared-types'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Space-optimised Levenshtein — O(n) space
function levenshteinSimilarity(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const maxLen = Math.max(m, n)
  if (maxLen === 0) return 1

  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = row[j]
      row[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1])
      prev = temp
    }
  }

  return 1 - row[n] / maxLen
}

export function validateOpenAnswer(submitted: string, question: Question): AnswerResult {
  const s = submitted.trim()
  const correct = question.correctAnswer

  // Tier 1: Exact (case-insensitive, trimmed)
  if (s.toLowerCase() === correct.toLowerCase().trim()) {
    return { correct: true, tier: AnswerValidationTier.EXACT }
  }

  // Tier 2: Normalized (remove punctuation, articles, extra whitespace)
  if (normalize(s) === normalize(correct)) {
    return { correct: true, tier: AnswerValidationTier.NORMALIZED }
  }

  // Tier 3: Admin-defined aliases
  for (const alias of question.aliases) {
    if (normalize(s) === normalize(alias)) {
      return { correct: true, tier: AnswerValidationTier.ALIAS }
    }
  }

  // Tier 4: Fuzzy (Levenshtein similarity against normalized correct answer)
  const similarity = levenshteinSimilarity(normalize(s), normalize(correct))
  if (similarity >= question.fuzzyThreshold) {
    return { correct: true, tier: AnswerValidationTier.FUZZY, similarity }
  }

  return { correct: false }
}
