import type { ReactNode } from 'react'
import { cn } from '@sheet/ui/utils'

/** Flat integration section — used under the Integrations top nav, not as stacked cards. */
export function IntegrationCard({
  title,
  status,
  description,
  children,
  className,
}: {
  title: string
  status?: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
          {status}
        </div>
        {description ? (
          <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </header>
      {children ? <div className="flex flex-col gap-2.5">{children}</div> : null}
    </section>
  )
}

export function IntegrationStatus({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 text-[10px] uppercase tracking-[0.12em]',
        tone === 'success' && 'text-success-foreground',
        tone === 'warning' && 'text-warning-foreground',
        tone === 'neutral' && 'text-muted-foreground',
      )}
    >
      {/* A dot carries the state; the colour on the word backs it up. */}
      <span aria-hidden="true" className={cn('size-1.5 rounded-full bg-current', tone === 'success' && 'cx-live')} />
      {children}
    </span>
  )
}
