import { useState, type ReactNode } from 'react'
import { cn } from '@sheet/ui/utils'
import { ChevronDownIcon, PlusIcon } from '@sheet/ui/icons'

/** A titled inspector block. `action` sits at the trailing edge of the header. */
export function InspectorSection({
  title,
  action,
  collapsible = false,
  children,
}: {
  title: string
  action?: ReactNode
  collapsible?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="space-y-3 border-b border-line/60 px-4 py-3.5">
      <div className="flex h-5 items-center justify-between gap-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            className="flex items-center gap-1 hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
          >
            <span>{title}</span>
            <ChevronDownIcon className={cn('size-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          </button>
        ) : (
          <span>{title}</span>
        )}
        {action ? <div className="flex items-center gap-1 text-muted-foreground">{action}</div> : null}
      </div>
      {open ? children : null}
    </section>
  )
}

/**
 * A row that stays a single quiet line until it has a value. `+` adds the
 * default, `−` removes it, and the value editor only shows once it exists.
 */
export function OptionalSection({
  title,
  active,
  onAdd,
  onRemove,
  children,
}: {
  title: string
  active: boolean
  onAdd: () => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <section className={cn('border-b border-line/60 px-4', active ? 'space-y-3 py-3.5' : 'py-0')}>
      <div className={cn('flex items-center justify-between gap-2 text-2xs font-medium uppercase tracking-[0.12em]', active ? 'h-5 text-foreground' : 'h-[41px] text-muted-foreground')}>
        <span>{title}</span>
        <button
          type="button"
          aria-label={active ? `Remove ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
          title={active ? `Remove ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
          className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
          onClick={active ? onRemove : onAdd}
        >
          {active ? <span className="h-px w-3 bg-current" /> : <PlusIcon className="size-4" />}
        </button>
      </div>
      {active ? children : null}
    </section>
  )
}

const AXIS = ['flex-start', 'center', 'flex-end'] as const

/**
 * The 3×3 pad that sets both flex alignments at once. The main axis follows
 * `direction`: in a row the columns are `justify-content`, in a column the rows are.
 */
export function AlignmentGrid({
  direction,
  justify,
  align,
  onChange,
}: {
  direction: 'row' | 'column'
  justify: string
  align: string
  onChange: (next: { justify: string; align: string }) => void
}) {
  const column = direction === 'column'
  const activeRow = AXIS.indexOf((column ? justify : align) as (typeof AXIS)[number])
  const activeColumn = AXIS.indexOf((column ? align : justify) as (typeof AXIS)[number])
  return (
    <div role="group" aria-label="Alignment" className="grid aspect-square w-full grid-cols-3 grid-rows-3 rounded-xl bg-well/90 p-1 ring-1 ring-border/40 shadow-inner">
      {AXIS.flatMap((_, row) =>
        AXIS.map((__, col) => {
          const active = row === activeRow && col === activeColumn
          const main = column ? AXIS[row] : AXIS[col]
          const cross = column ? AXIS[col] : AXIS[row]
          return (
            <button
              key={`${row}:${col}`}
              type="button"
              aria-label={`Align ${['top', 'middle', 'bottom'][row]} ${['left', 'center', 'right'][col]}`}
              aria-pressed={active}
              className={cn(
                'group grid place-items-center rounded-lg transition-all duration-150 active:scale-90',
                active ? 'bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-border/50' : 'hover:bg-surface/50',
              )}
              onClick={() => onChange({ justify: main, align: cross })}
            >
              <span
                className={cn(
                  'rounded-full transition-all duration-150',
                  active ? 'size-2.5 bg-cx-accent shadow-xs' : 'size-1 bg-muted-foreground/60 group-hover:bg-foreground',
                )}
              />
            </button>
          )
        }),
      )}
    </div>
  )
}

/** Two- or three-way icon toggle in the panel's pill style. */
export function IconToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: readonly { value: T; label: string; icon: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="grid h-8 grid-flow-col auto-cols-fr rounded-xl bg-well/90 p-0.5 ring-1 ring-border/40 shadow-inner">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          title={option.label}
          aria-pressed={value === option.value}
          className={cn(
            'grid place-items-center rounded-lg text-muted-foreground transition-all duration-150 active:scale-95',
            value === option.value
              ? 'bg-surface text-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-border/50 scale-[1.01]'
              : 'hover:text-foreground hover:bg-surface/40',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}

/** Split a CSS list on top-level commas, so `rgba(0, 0, 0, .2)` stays whole. */
function splitTopLevel(value: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

const isInset = (shadow: string) => /(^|\s)inset(\s|$)/.test(shadow)

/** `box-shadow` holds both drop and inner shadows; the panel edits them as two lists. */
export function readShadows(value: string | undefined) {
  const parts = value && value !== 'none' ? splitTopLevel(value) : []
  return {
    outer: parts.filter((part) => !isInset(part)).join(', '),
    inner: parts.filter(isInset).map((part) => part.replace(/(^|\s)inset(\s|$)/, ' ').trim()).join(', '),
  }
}

export function writeShadows(outer: string, inner: string) {
  const parts = [
    ...splitTopLevel(outer),
    ...splitTopLevel(inner).map((part) => `inset ${part}`),
  ]
  return parts.length ? parts.join(', ') : null
}

const COLOR_PATTERN = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi
const COLOR_PROPERTIES = new Set([
  'background',
  'background-color',
  'color',
  'border',
  'border-color',
  'outline',
  'outline-color',
  'box-shadow',
  'fill',
  'stroke',
])

export interface SelectionColor {
  color: string
  count: number
}

/** Distinct authored colors across some nodes' inline styles, most used first. */
export function collectSelectionColors(styles: readonly Record<string, string>[]): SelectionColor[] {
  const counts = new Map<string, number>()
  for (const style of styles) {
    for (const [property, value] of Object.entries(style)) {
      if (!COLOR_PROPERTIES.has(property)) continue
      for (const match of value.matchAll(COLOR_PATTERN)) {
        const color = match[0].toLowerCase()
        counts.set(color, (counts.get(color) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color))
}

/** The styles of one node with every occurrence of `from` swapped for `to`; `null` if none changed. */
export function replaceColorInStyles(styles: Record<string, string>, from: string, to: string) {
  const changed: Record<string, string> = {}
  for (const [property, value] of Object.entries(styles)) {
    if (!COLOR_PROPERTIES.has(property)) continue
    const next = value.replace(COLOR_PATTERN, (match) => (match.toLowerCase() === from ? to : match))
    if (next !== value) changed[property] = next
  }
  return Object.keys(changed).length ? changed : null
}

/** A CSS color for an `<input type="color">`, which only accepts `#rrggbb`. */
export function toColorInputValue(color: string) {
  if (/^#[\da-f]{6}$/i.test(color)) return color
  if (/^#[\da-f]{3}$/i.test(color)) {
    const [, r, g, b] = color
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}
