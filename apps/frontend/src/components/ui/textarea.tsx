import { cn } from '@/lib/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string
}

export function Textarea({ className, ...props }: TextareaProps): React.ReactElement {
  return (
    <textarea
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-border bg-surface text-white text-sm',
        'placeholder:text-text-muted resize-none',
        'focus:outline-none focus:ring-2 focus:ring-blitz-accent/50 focus:border-blitz-accent transition-colors',
        className,
      )}
      {...props}
    />
  )
}
