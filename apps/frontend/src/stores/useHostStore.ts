'use client'
import { create } from 'zustand'
import type { Quiz, Session, NetworkInfo } from '@apoquiz/shared-types'
import { api } from '@/lib/api'

interface HostStore {
  isAuthenticated: boolean
  quizzes: Quiz[]
  currentQuiz: Quiz | null
  currentSession: Session | null
  networkInfo: NetworkInfo | null

  setAuthenticated: (v: boolean) => void
  loadQuizzes: () => Promise<void>
  loadQuiz: (id: string) => Promise<void>
  setCurrentSession: (s: Session | null) => void
  loadNetworkInfo: () => Promise<void>
  reset: () => void
}

export const useHostStore = create<HostStore>((set) => ({
  isAuthenticated: false,
  quizzes: [],
  currentQuiz: null,
  currentSession: null,
  networkInfo: null,

  setAuthenticated: (v) => set({ isAuthenticated: v }),

  loadQuizzes: async () => {
    const quizzes = await api.get<Quiz[]>('/quiz')
    set({ quizzes })
  },

  loadQuiz: async (id) => {
    const quiz = await api.get<Quiz>(`/quiz/${id}`)
    set({ currentQuiz: quiz })
  },

  setCurrentSession: (s) => set({ currentSession: s }),

  loadNetworkInfo: async () => {
    const info = await api.get<NetworkInfo>('/network/info')
    set({ networkInfo: info })
  },

  reset: () => set({ isAuthenticated: false, quizzes: [], currentQuiz: null, currentSession: null }),
}))
