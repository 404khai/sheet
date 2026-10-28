import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@sheet/ui/utils'

type Option<T extends string> = { value: T; label: string; badge?: ReactNode }

/** Left/Right arrows move between options, as in any tab list or radio group. */
function arrowNavigate<T extends string>(
  event: KeyboardEvent<HTMLDivElement>,
  options: readonly Option<T>[],
  index: number,
  onChange: (value: T) => void,
  role: string,
) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  event.preventDefault()
  const nextIndex = (index + delta + options.length) % options.length
  const next = options[nextIndex]
  if (!next) return
  onChange(next.value)
  event.currentTarget.querySelectorAll<HTMLButtonElement>(`[role="${role}"]`)[nextIndex]?.focus()
}

/**
 * The tabs across the top of a side panel: words, not icons, so every view is
 * named. A 2px underline glides to the one in use.
 */
export function PanelTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  trailing,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
  trailing?: ReactNode
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-line px-1.5">
      <div
        role="tablist"
        aria-label={label}
        className="relative flex items-stretch"
        onKeyDown={(event) => arrowNavigate(event, options, index, onChange, 'tab')}
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-cuelume-select=""
              onClick={() => onChange(option.value)}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
              {option.badge}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-foreground transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  selected ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0',
                )}
              />
            </button>
          )
        })}
      </div>
      {trailing ? <div className="ms-auto flex items-center gap-0.5">{trailing}</div> : null}
    </div>
  )
}

/** A small either/or inside a panel: a sunken track with a raised thumb that glides. */
export function PanelSegment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid h-7 auto-cols-fr grid-flow-col rounded-lg bg-well p-0.5 shadow-sunken"
      onKeyDown={(event) => arrowNavigate(event, options, index, onChange, 'radio')}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0.5 start-0.5 rounded-md bg-surface shadow-raised transition-[translate] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ width: `calc((100% - 0.25rem) / ${options.length})`, translate: `${index * 100}% 0` }}
      />
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 rounded-md text-[11px] outline-none transition-[color,scale] duration-150 ease-smooth active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
