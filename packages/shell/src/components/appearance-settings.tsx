import { useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@sheet/ui/utils'
import {
  ACCENTS,
  DEFAULT_ACCENT,
  getAccent,
  setAccent,
  type AccentId,
} from '../lib/accent'
import {
  DEFAULT_THEME,
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../lib/theme'
import {
  DEFAULT_UI_SCALE,
  getUiScale,
  setUiScale,
  UI_SCALES,
  type UiScale,
} from '../lib/ui-scale'
import {
  DEFAULT_UI_FONT,
  DEFAULT_UI_FONT_WEIGHT,
  getUiFont,
  getUiFontWeight,
  setUiFont,
  setUiFontWeight,
  UI_FONTS,
  UI_FONT_WEIGHTS,
  type UiFont,
  type UiFontId,
  type UiFontWeightValue,
} from '../lib/ui-font'
import {
  DEFAULT_SOUND,
  DEFAULT_VOLUME,
  getSoundPreference,
  getVolumePreference,
  setSoundPreference,
  setVolumePreference,
  VOLUME_LEVELS,
  type SoundPreference,
  type VolumeLevel,
} from '@sheet/ui/sound'

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>

const PLANE = {
  light: { bg: '#fafaf9', fg: '#0d0d0d', rule: '#e4e4e0' },
  dark: { bg: '#212121', fg: '#ececea', rule: '#363636' },
} as const

/** One window, drawn flat: a sidebar rule, three lines of text, the accent dot. */
function Plane({ tone }: { tone: keyof typeof PLANE }) {
  const { bg, fg, rule } = PLANE[tone]
  return (
    <g>
      <rect width="96" height="60" fill={bg} />
      <path d="M26 0v60" stroke={rule} strokeWidth="1" />
      <path d="M6 10h14M6 17h10M6 24h12" stroke={fg} strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M36 14h38M36 22h46M36 30h30" stroke={fg} strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="80" y="46" width="5" height="5" style={{ fill: 'var(--cx-accent)' }} />
    </g>
  )
}

/** A miniature of the app in that palette. System splits one window on the diagonal. */
function ThemeSpecimen({ mode }: { mode: ThemePreference }) {
  return (
    <svg viewBox="0 0 96 60" aria-hidden="true" className="block h-auto w-full">
      {mode === 'dark' ? <Plane tone="dark" /> : <Plane tone="light" />}
      {mode === 'system' ? (
        <>
          <defs>
            <clipPath id="cx-specimen-system">
              <path d="M96 0v60H0z" />
            </clipPath>
          </defs>
          <g clipPath="url(#cx-specimen-system)">
            <Plane tone="dark" />
          </g>
        </>
      ) : null}
    </svg>
  )
}

const SCALE_LABELS: Record<UiScale, string> = {
  0.9: 'Compact',
  1: 'Default',
  1.1: 'Large',
  1.25: 'Larger',
  1.5: 'Largest',
}

const FONT_FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'Sans Serif', label: 'Sans' },
  { value: 'Monospace', label: 'Mono' },
  { value: 'Display', label: 'Display' },
] as const satisfies ReadonlyArray<{ value: 'All' | UiFont['category']; label: string }>

type FontFilter = (typeof FONT_FILTERS)[number]['value']

/** The sunken track every stepped control sits in. */
const WELL = 'rounded-xl bg-well shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]'

/**
 * The chosen-mark: a check in the accent. It stays mounted and resolves out of
 * a blur, so choosing reads as the mark arriving rather than a pop.
 */
export function Mark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full bg-cx-accent text-white transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
        on ? 'scale-100 opacity-100 blur-[0px]' : 'scale-[0.25] opacity-0 blur-[4px]',
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-2.5">
        <path d="M4 8.5 6.8 11 12 5.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/**
 * A row of stops in a sunken track, with one raised thumb that glides to the
 * choice. Arrow keys move the choice, as in any radio group, and only the
 * chosen stop takes a tab stop.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; content: ReactNode; name?: string }>
  onChange: (next: T) => void
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const nextIndex = (index + delta + options.length) % options.length
    const next = options[nextIndex]
    if (!next) return
    onChange(next.value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('relative grid auto-cols-fr grid-flow-col p-1', WELL)}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 start-1 rounded-lg bg-surface shadow-lift transition-transform duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.name}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'group relative z-10 flex min-h-10 min-w-0 items-center justify-center rounded-lg px-1.5 py-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="flex min-w-0 flex-col items-center gap-1.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-active:scale-[0.96]">
              {option.content}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** An on/off row: its state in words, and a track with a knob that travels it. */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'group flex h-11 items-center justify-between px-3.5 text-xs text-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
        WELL,
      )}
      onClick={() => onChange(!checked)}
    >
      <span key={String(checked)} className="cx-swap font-medium">
        {checked ? 'On' : 'Off'}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-smooth',
          checked
            ? 'bg-cx-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
            : 'bg-muted-foreground/25 shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[transform,width] duration-200 ease-smooth group-active:w-5',
            checked ? 'translate-x-4 group-active:translate-x-3' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}

/**
 * One raised card per setting: what it is, why, and — when there is one — the
 * current value, which re-settles whenever it changes. The body is a container,
 * so what sits in it lays out for the card's width, not the window's.
 */
export function Section({
  label,
  hint,
  value,
  flat = false,
  children,
}: {
  label: string
  hint: string
  value?: string
  /** No card of its own, for use inside a surface that is already raised (onboarding). */
  flat?: boolean
  children: ReactNode
}) {
  return (
    <section className={cn('flex flex-col gap-4', !flat && 'rounded-2xl bg-surface p-4 shadow-lift sm:p-5')}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">{hint}</p>
        </div>
        {value ? (
          <span key={value} className="cx-swap shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground">
            {value}
          </span>
        ) : null}
      </header>
      <div className="@container flex flex-col gap-3">{children}</div>
    </section>
  )
}

/**
 * Theme, accent, typeface and interface size. Every choice applies the moment
 * it is made, in this window and in the app's other windows: the whole app is
 * the preview, which beats a swatch for a choice about colour or size.
 */
export function AppearanceSettings({
  className,
  showScale = true,
  flat = false,
}: {
  className?: string
  /** Interface size is left out of first-run onboarding; Settings keeps it. */
  showScale?: boolean
  /** Sections without cards of their own, inside an already-raised surface. */
  flat?: boolean
}) {
  const [theme, setTheme] = useState<ThemePreference>(DEFAULT_THEME)
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT)
  const [scale, setScale] = useState<UiScale>(DEFAULT_UI_SCALE)
  const [font, setFontState] = useState<UiFontId>(DEFAULT_UI_FONT)
  const [fontWeight, setFontWeightState] = useState<UiFontWeightValue>(DEFAULT_UI_FONT_WEIGHT)
  const [fontFilter, setFontFilter] = useState<FontFilter>('All')

  useEffect(() => {
    setTheme(getThemePreference())
    setAccentState(getAccent())
    setScale(getUiScale())
    setFontState(getUiFont())
    setFontWeightState(getUiFontWeight())
  }, [])

  const displayFonts = fontFilter === 'All' ? UI_FONTS : UI_FONTS.filter((option) => option.category === fontFilter)
  const activeFont = UI_FONTS.find((option) => option.id === font) ?? UI_FONTS[0]
  const activeWeight = UI_FONT_WEIGHTS.find((option) => option.value === fontWeight)
  const activeAccent = ACCENTS.find((option) => option.id === accent)
  const activeTheme = THEME_OPTIONS.find((option) => option.value === theme)

  return (
    <div className={cn('flex flex-col gap-4 sm:gap-5', className)}>
      <Section flat={flat} label="Theme" hint="System follows your device. Your designs are never affected." value={activeTheme?.label}>
        <div className="grid grid-cols-3 gap-2 @sm:gap-3" role="radiogroup" aria-label="Color theme">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className="cx-tile flex min-w-0 flex-col gap-2 rounded-[14px] bg-surface p-1.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setTheme(option.value)
                  setThemePreference(option.value)
                }}
              >
                <span className="block overflow-hidden rounded-lg outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
                  <ThemeSpecimen mode={option.value} />
                </span>
                <span className="flex items-center justify-between gap-1 px-1 pb-0.5 text-xs">
                  <span className={cn('truncate transition-colors duration-150', selected ? 'text-foreground' : 'text-muted-foreground')}>
                    {option.label}
                  </span>
                  <Mark on={selected} />
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section flat={flat} label="Accent" hint="The one colour spent on selection, focus and whatever is live." value={activeAccent?.label}>
        <div className="grid grid-cols-6 gap-2 @sm:gap-2.5" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((option) => {
            const selected = accent === option.id
            const vars = { '--sw-l': option.light, '--sw-d': option.dark } as CSSProperties
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                style={vars}
                className="cx-tile group grid aspect-square min-w-0 place-items-center rounded-xl bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setAccentState(option.id)
                  setAccent(option.id)
                }}
              >
                <span className="grid size-[44%] place-items-center rounded-full bg-(--sw-l) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.2)] transition-[scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-aria-checked:scale-110 dark:bg-(--sw-d)">
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className={cn(
                      'size-[55%] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
                      selected ? 'scale-100 opacity-100 blur-[0px]' : 'scale-[0.25] opacity-0 blur-[4px]',
                    )}
                  >
                    <path d="M4 8.5 6.8 11 12 5.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        flat={flat}
        label="Typeface"
        hint="Every panel, menu and label in Sheet. Your designs keep their own fonts."
        value={activeFont.label}
      >
        {/* The specimen: the pick, at the weight, before you read another word of the app in it. */}
        <div className={cn('overflow-hidden', WELL)}>
          <div
            key={`${font}:${fontWeight}`}
            className="cx-swap flex items-end gap-4 px-4 pb-4 pt-5 @sm:gap-5 @sm:px-5"
            style={{ fontFamily: activeFont.stack, fontWeight }}
          >
            <span aria-hidden="true" className="text-[52px] leading-[0.78] tracking-tight text-foreground select-none @sm:text-[68px]">
              Aa
            </span>
            <span className="min-w-0 pb-0.5">
              <span className="block text-sm leading-snug text-pretty text-foreground">
                Frames, layers, and the quiet labels between them.
              </span>
              <span className="mt-1.5 block truncate text-[11px] tabular-nums text-muted-foreground">
                {activeFont.category} · {activeWeight?.label} {fontWeight}
              </span>
            </span>
          </div>
        </div>

        <Segmented
          label="Font weight"
          value={fontWeight}
          options={UI_FONT_WEIGHTS.map((option) => ({
            value: option.value,
            name: `${option.label} ${option.value}`,
            content: (
              <>
                <span aria-hidden="true" className="text-[15px] leading-none" style={{ fontWeight: option.value }}>
                  Aa
                </span>
                <span className="max-w-full truncate text-[10px] leading-none tabular-nums">{option.value}</span>
              </>
            ),
          }))}
          onChange={(next) => {
            setFontWeightState(next)
            setUiFontWeight(next)
          }}
        />

        <div className="mt-1 flex flex-col gap-2.5">
          <Segmented
            label="Font category"
            value={fontFilter}
            options={FONT_FILTERS.map((option) => ({
              value: option.value,
              content: (
                <span className="flex items-baseline gap-1.5">
                  <span>{option.label}</span>
                  <span className="text-[10px] tabular-nums opacity-50">
                    {option.value === 'All' ? UI_FONTS.length : UI_FONTS.filter((entry) => entry.category === option.value).length}
                  </span>
                </span>
              ),
            }))}
            onChange={setFontFilter}
          />

          {/* Re-keyed per category so the list arrives one card at a time. */}
          <div key={fontFilter} className="cx-stagger grid grid-cols-1 gap-2 @md:grid-cols-2" role="radiogroup" aria-label="Typeface">
            {displayFonts.map((option, index) => {
              const selected = font === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  style={{ '--i': index } as CSSProperties}
                  className="cx-tile flex min-h-14 min-w-0 items-center gap-3 rounded-[14px] bg-surface py-2 ps-2 pe-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setFontState(option.id)
                    setUiFont(option.id)
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-lg bg-well/80 text-[17px] text-foreground"
                    style={{ fontFamily: option.stack }}
                  >
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight text-foreground" style={{ fontFamily: option.stack }}>
                      {option.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {option.id === DEFAULT_UI_FONT ? 'Default · ' : ''}
                      {option.previewText ?? option.category}
                    </span>
                  </span>
                  <Mark on={selected} />
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      {showScale ? (
        <Section
          flat={flat}
          label="Interface size"
          hint="Scales menus, panels and text. Designs keep their own size; use canvas zoom for those."
          value={SCALE_LABELS[scale]}
        >
          <Segmented
            label="Interface size"
            value={scale}
            options={UI_SCALES.map((option) => ({
              value: option,
              name: `${SCALE_LABELS[option]}, ${Math.round(option * 100)} percent`,
              content: (
                <>
                  <span aria-hidden="true" className="leading-none" style={{ fontSize: `${Math.round(option * 12)}px` }}>
                    Aa
                  </span>
                  <span className="text-[10px] leading-none tabular-nums">{Math.round(option * 100)}%</span>
                </>
              ),
            }))}
            onChange={(next) => {
              setScale(next)
              setUiScale(next)
            }}
          />
        </Section>
      ) : null}
    </div>
  )
}

/** Sound on or off, and how loud, as five bars you can press. */
export function SoundSettings({ className, flat = false }: { className?: string; flat?: boolean }) {
  const [sound, setSound] = useState<SoundPreference>(DEFAULT_SOUND)
  const [volume, setVolume] = useState<VolumeLevel>(DEFAULT_VOLUME)

  useEffect(() => {
    setSound(getSoundPreference())
    setVolume(getVolumePreference())
  }, [])

  return (
    <div className={cn('flex flex-col gap-4 sm:gap-5', className)}>
      <Section flat={flat} label="Sound" hint="Cues for taps, hovers, menus and finished work.">
        <SwitchRow
          label="Sound"
          checked={sound === 'on'}
          onChange={(on) => {
            const next: SoundPreference = on ? 'on' : 'off'
            setSound(next)
            setSoundPreference(next)
          }}
        />
      </Section>

      <Section
        flat={flat}
        label="Volume"
        hint="Press a bar. The sound you hear is the level you chose."
        value={`${Math.round(volume * 100)}%`}
      >
        <div
          className={cn('flex h-16 items-end gap-2 p-2.5 transition-opacity duration-200', WELL, sound === 'off' && 'opacity-40')}
          role="radiogroup"
          aria-label="Volume"
        >
          {VOLUME_LEVELS.map((level, index) => {
            const reached = level <= volume
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={volume === level}
                aria-label={`Volume ${Math.round(level * 100)} percent`}
                disabled={sound === 'off'}
                className="cx-press group flex h-full flex-1 items-end outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                onClick={() => {
                  setVolume(level)
                  setVolumePreference(level)
                }}
              >
                <span
                  className={cn(
                    'block w-full rounded-md transition-[background-color,box-shadow] duration-200',
                    reached
                      ? 'bg-cx-accent shadow-[0_1px_3px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.3)]'
                      : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/40',
                  )}
                  style={{ height: `${28 + index * 18}%` }}
                />
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
