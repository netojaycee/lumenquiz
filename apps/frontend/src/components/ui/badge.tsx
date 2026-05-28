import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface-elevated text-text-secondary border-border',
  success: 'bg-correct/10 text-correct border-correct/20',
  warning: 'bg-timer-warning/10 text-timer-warning border-timer-warning/20',
  error:   'bg-wrong/10 text-wrong border-wrong/20',
  info:    'bg-blitz-accent/10 text-blitz-accent border-blitz-accent/20',
}

export function Badge({ children, variant = 'default', className }: BadgeProps): React.ReactElement {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', VARIANTS[variant], className)}>
      {children}
    </span>
  )
}
