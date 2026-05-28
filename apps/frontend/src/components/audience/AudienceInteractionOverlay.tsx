'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Timer, CheckCircle2, Send, Zap, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AudienceInteractionType, AudienceActivity } from '@apoquiz/shared-types'
import { useAudienceStore } from '@/stores/useAudienceStore'
import { useSocketStore } from '@/stores/useSocketStore'
import { AUDIENCE_EVENTS } from '@apoquiz/socket-events'

export function AudienceInteractionOverlay() {
  const { activeInteraction, hasSubmittedInteraction, submitInteraction, audienceId, sessionId } =
    useAudienceStore()
  const { emit } = useSocketStore()

  const [inputValue, setInputValue] = useState('')
  const [selectedOption, setSelectedOption] = useState<string | number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!activeInteraction) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((activeInteraction.deadline - Date.now()) / 1000))
      setTimeLeft(left)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [activeInteraction])

  // Reset local state when interaction changes
  useEffect(() => {
    setInputValue('')
    setSelectedOption(null)
  }, [activeInteraction?.activity, activeInteraction?.questionId])

  if (!activeInteraction) return null

  const handleSubmit = () => {
    if (hasSubmittedInteraction) return

    const payload: any = {}
    if (activeInteraction.type === AudienceInteractionType.PREDICTION) {
      if (activeInteraction.activity === AudienceActivity.CLUE_DEPTH_PREDICTION) {
        payload.predictedValue = Number(selectedOption)
      } else {
        payload.predictedTeamId = String(selectedOption)
      }
      emit(AUDIENCE_EVENTS.PREDICT_SUBMIT, {
        audienceId,
        sessionId,
        questionId: activeInteraction.questionId,
        ...payload,
      })
    } else if (activeInteraction.type === AudienceInteractionType.GHOST_ANSWER) {
      payload.answer = inputValue
      emit(AUDIENCE_EVENTS.GHOST_ANSWER_SUBMIT, {
        audienceId,
        sessionId,
        questionId: activeInteraction.questionId,
        ...payload,
      })
    }

    submitInteraction(payload)
  }

  const Icon = activeInteraction.type === AudienceInteractionType.PREDICTION ? Zap : Activity

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-x-4 bottom-24 z-50 overflow-hidden"
      >
        <div className="bg-surface/95 border-blitz-accent/30 rounded-2xl border p-5 shadow-2xl backdrop-blur-md">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blitz-accent/20 rounded-lg p-1.5">
                <Icon className="text-blitz-accent h-4 w-4" />
              </div>
              <span className="text-blitz-accent text-[10px] font-bold tracking-widest uppercase">
                {activeInteraction.type.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1">
              <Timer
                className={cn(
                  'h-3 w-3',
                  timeLeft < 3 ? 'text-wrong animate-pulse' : 'text-text-muted',
                )}
              />
              <span
                className={cn(
                  'font-mono text-xs font-bold',
                  timeLeft < 3 ? 'text-wrong' : 'text-white',
                )}
              >
                {timeLeft}s
              </span>
            </div>
          </div>

          <h3 className="mb-4 text-sm leading-tight font-bold text-white">
            {activeInteraction.prompt}
          </h3>

          <div className="space-y-3">
            {hasSubmittedInteraction ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-4 text-center"
              >
                <div className="bg-correct/20 mb-2 rounded-full p-2">
                  <CheckCircle2 className="text-correct h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-white">Submitted!</p>
                <p className="text-text-muted text-[10px]">
                  Watch the teams and see if you&apos;re right.
                </p>
              </motion.div>
            ) : (
              <>
                {/* Prediction Options (Teams or Values) */}
                {activeInteraction.type === AudienceInteractionType.PREDICTION &&
                  activeInteraction.options && (
                    <div className="grid grid-cols-2 gap-2">
                      {activeInteraction.options.map((opt: any) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedOption(opt.id)}
                          className={cn(
                            'relative flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all active:scale-95',
                            selectedOption === opt.id
                              ? 'bg-blitz-accent/20 border-blitz-accent shadow-blitz-accent/10 shadow-lg'
                              : 'border-border hover:border-text-muted/50 bg-black/20',
                          )}
                        >
                          {opt.color && (
                            <div
                              className="h-3 w-3 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: opt.color }}
                            />
                          )}
                          <span className="truncate text-xs font-medium text-white">
                            {opt.name}
                          </span>
                          {selectedOption === opt.id && (
                            <motion.div layoutId="check" className="ml-auto">
                              <CheckCircle2 className="text-blitz-accent h-3.5 w-3.5" />
                            </motion.div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                {/* Ghost Answer Input */}
                {activeInteraction.type === AudienceInteractionType.GHOST_ANSWER && (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Type your answer..."
                      className="border-border focus:border-blitz-accent/50 flex-1 rounded-xl border bg-black/30 px-4 py-2.5 text-sm text-white transition-all outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                  </div>
                )}

                <Button
                  className="h-11 w-full rounded-xl font-bold transition-all active:scale-95"
                  disabled={
                    (activeInteraction.type === AudienceInteractionType.PREDICTION &&
                      selectedOption === null) ||
                    (activeInteraction.type === AudienceInteractionType.GHOST_ANSWER &&
                      !inputValue.trim())
                  }
                  onClick={handleSubmit}
                  style={{
                    background: 'linear-gradient(135deg, #A855F7 0%, #3B82F6 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  }}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Submit{' '}
                  {activeInteraction.type === AudienceInteractionType.PREDICTION
                    ? 'Pick'
                    : 'Answer'}
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
