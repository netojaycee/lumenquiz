export interface ImportedQuestionRow {
  order?: number
  type: string
  text: string
  correctAnswer: string
  aliases?: string
  difficulty?: string
  points?: number
  optionA?: string
  optionB?: string
  optionC?: string
  optionD?: string
  correctOption?: string
}

export interface ParsedImportQuestion {
  order: number
  type: string
  text: string
  correctAnswer: string
  aliases: string[]
  clues: string[]
  difficulty: string
  points: number | null
  options: Array<{ label: string; text: string; isCorrect: boolean }> | null
  errors: string[]
}
