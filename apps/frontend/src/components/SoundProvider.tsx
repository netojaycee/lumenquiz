'use client'
import { useEffect } from 'react'
import { soundManager } from '@/lib/sound'

export function SoundProvider(): null {
  useEffect(() => {
    void soundManager.initWithRemoteConfig()
  }, [])
  return null
}
