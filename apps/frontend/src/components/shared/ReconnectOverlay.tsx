'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'

interface ReconnectOverlayProps {
  show: boolean
  /** 'full' = covers the whole screen (team/audience). 'banner' = top strip (projector/moderator). */
  variant?: 'full' | 'banner'
}

export function ReconnectOverlay({ show, variant = 'full' }: ReconnectOverlayProps) {
  return (
    <AnimatePresence>
      {show && (
        variant === 'full' ? (
          <motion.div
            key="reconnect-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#08080E]/90 backdrop-blur-sm"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30"
            >
              <WifiOff className="h-7 w-7 text-red-400" />
            </motion.div>
            <div className="text-center">
              <p className="text-white text-lg font-black">Connection lost</p>
              <p className="text-white/40 text-sm mt-1">Reconnecting — please wait…</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  className="h-2 w-2 rounded-full bg-red-400"
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reconnect-banner"
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-3 bg-red-600/90 backdrop-blur-sm py-2.5 px-6"
          >
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            >
              <WifiOff className="h-4 w-4 text-white" />
            </motion.div>
            <p className="text-white text-sm font-bold">Connection lost — reconnecting…</p>
          </motion.div>
        )
      )}
    </AnimatePresence>
  )
}
