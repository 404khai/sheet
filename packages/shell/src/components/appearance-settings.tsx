import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

/** An on/off row: its state in words, and a hairline track with a square that travels it. */
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
      className="flex h-11 items-center justify-between rounded-xl border border-line/70 bg-surface-2/40 px-3.5 text-xs text-foreground shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.04),0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all duration-150 hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onChange(!checked)}
    >
      <span className="font-medium text-xs">{checked ? 'Enabled' : 'Disabled'}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 border border-border/70 transition-colors duration-200 ease-smooth',
          checked
            ? 'bg-cx-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
            : 'bg-surface shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] dark:bg-surface-2',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.95)] transition-transform duration-200 ease-smooth',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}

export function Section({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-line/70 bg-surface/80 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Theme, accent and interface size. Every choice applies the moment it is
 * made, in this window and in the app's other windows: the whole app is the
 * preview, which beats a swatch for a choice about colour or size.
 */
export function AppearanceSettings({
  className,
  showScale = true,
}: {
  className?: string
  /** Interface size is left out of first-run onboarding; Settings keeps it. */
  showScale?: boolean
}) {
  const [theme, setTheme] = useState<ThemePreference>(DEFAULT_THEME)
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT)
  const [scale, setScale] = useState<UiScale>(DEFAULT_UI_SCALE)
  const [font, setFontState] = useState<UiFontId>(DEFAULT_UI_FONT)
  const [fontWeight, setFontWeightState] = useState<UiFontWeightValue>(DEFAULT_UI_FONT_WEIGHT)
  const [fontFilter, setFontFilter] = useState<'All' | 'Sans Serif' | 'Monospace' | 'Display'>('All')

  useEffect(() => {
    setTheme(getThemePreference())
    setAccentState(getAccent())
    setScale(getUiScale())
    setFontState(getUiFont())
    setFontWeightState(getUiFontWeight())
  }, [])

  const scaleIndex = Math.max(0, UI_SCALES.indexOf(scale))
  const fontWeightIndex = Math.max(0, UI_FONT_WEIGHTS.findIndex((w) => w.value === fontWeight))
  const displayFonts = fontFilter === 'All' ? UI_FONTS : UI_FONTS.filter((f) => f.category === fontFilter)
  const activeFont = UI_FONTS.find((f) => f.id === font) ?? UI_FONTS[0]

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <Section label="Theme" hint="System follows your device. Your designs are never affected.">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Color theme">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  'cx-press group flex min-w-0 flex-col gap-2.5 rounded-xl p-2.5 text-start outline-none transition-all duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'bg-surface text-foreground font-medium ring-2 ring-cx-accent shadow-[0_4px_14px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] scale-[1.02]'
                    : 'bg-surface-2/60 text-muted-foreground border border-line/70 hover:border-line hover:text-foreground hover:shadow-xs active:scale-[0.98]',
                )}
                onClick={() => {
                  setTheme(option.value)
                  setThemePreference(option.value)
                }}
              >
                <span className="block overflow-hidden rounded-lg border border-line/60 shadow-xs">
                  <ThemeSpecimen mode={option.value} />
                </span>
                <span className="px-0.5 text-xs flex items-center justify-between">
                  <span>{option.label}</span>
                  {selected && <span className="size-1.5 rounded-full bg-cx-accent shadow-[0_0_6px_var(--cx-accent)]" />}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Accent" hint="The one colour used for selection, focus and whatever is live.">
        <div className="grid grid-cols-6 gap-2.5" role="radiogroup" aria-label="Accent colour">
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
                className={cn(
                  'cx-press group relative flex aspect-square min-w-0 items-center justify-center rounded-xl outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] ring-2 ring-cx-accent scale-105'
                    : 'bg-surface-2/60 border border-line/70 hover:bg-surface hover:border-line active:scale-95',
                )}
                onClick={() => {
                  setAccentState(option.id)
                  setAccent(option.id)
                }}
              >
                <span
                  className="size-5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-150 group-hover:scale-110"
                  style={{ backgroundColor: 'var(--sw-l)' }}
                />
              </button>
            )
          })}
        </div>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          Active: <span className="font-medium text-foreground">{ACCENTS.find((option) => option.id === accent)?.label}</span>
        </p>
      </Section>

      <Section
        label="UI Typography"
        hint="Sets the master typeface and physical weight applied universally across all tools, panels, dialogs, and chrome."
      >
        {/* Live Typographic Specimen Stage */}
        <div
          className="relative overflow-hidden rounded-2xl border border-line/80 bg-gradient-to-b from-surface via-surface to-surface-2/60 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200"
          style={{ fontFamily: activeFont.stack }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-line/60">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-cx-accent shadow-[0_0_8px_var(--cx-accent)] animate-pulse" />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                {activeFont.label}
              </span>
              <span className="rounded-md bg-well/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border/50">
                {activeFont.category}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-foreground shadow-xs border border-line/60">
                {fontWeight} · {UI_FONT_WEIGHTS.find((w) => w.value === fontWeight)?.label}
              </span>
            </div>
          </div>

          <div
            className="my-3 text-3xl sm:text-4xl font-normal tracking-tight text-foreground select-none transition-all duration-200"
            style={{ fontWeight }}
          >
            Aa Bb Gg 0123
          </div>

          <p
            className="text-xs text-foreground/80 leading-relaxed max-w-xl transition-all duration-200"
            style={{ fontWeight }}
          >
            The quick brown fox jumps over the lazy dog. Crafted interface typography for infinite canvas architecture.
          </p>

          <div className="mt-3 pt-3 border-t border-line/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/70 tracking-widest uppercase select-none">
            <span>A B C D E F G H I J K L M N O P Q R S T U V W X Y Z</span>
            <span className="font-mono text-[9px] tabular-nums">0 1 2 3 4 5 6 7 8 9</span>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-well/90 p-1 ring-1 ring-border/50 shadow-inner" role="tablist" aria-label="Font categories">
          {(['All', 'Sans Serif', 'Monospace', 'Display'] as const).map((cat) => {
            const active = fontFilter === cat
            const count = cat === 'All' ? UI_FONTS.length : UI_FONTS.filter((f) => f.category === cat).length
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFontFilter(cat)}
                className={cn(
                  'cx-press flex-1 rounded-lg py-1.5 px-3 text-xs text-center transition-all duration-150 outline-none',
                  active
                    ? 'bg-surface font-semibold text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-border/60'
                    : 'text-muted-foreground hover:bg-surface/50 hover:text-foreground',
                )}
              >
                <span>{cat}</span>
                <span className="ml-1.5 opacity-60 font-mono text-[10px]">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Font Cards Grid */}
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="UI Font family">
          {displayFonts.map((option) => {
            const selected = font === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  'cx-press group relative flex flex-col justify-between rounded-xl p-3.5 text-start outline-none transition-all duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'bg-surface text-foreground font-medium ring-2 ring-cx-accent shadow-[0_6px_20px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] scale-[1.015]'
                    : 'bg-surface-2/40 text-muted-foreground border border-line/70 hover:border-line hover:text-foreground hover:bg-surface hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] active:scale-[0.985]',
                )}
                onClick={() => {
                  setFontState(option.id)
                  setUiFont(option.id)
                }}
              >
                <div className="flex items-center justify-between gap-1 w-full pb-2 border-b border-line/40">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {option.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded bg-well/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground border border-border/40">
                      {option.category === 'Sans Serif' ? 'Sans' : option.category === 'Monospace' ? 'Mono' : 'Display'}
                    </span>
                    {selected && (
                      <span className="size-2 rounded-full bg-cx-accent shadow-[0_0_8px_var(--cx-accent)]" />
                    )}
                  </div>
                </div>

                <div
                  className="my-2.5 text-xl font-normal text-foreground/90 tracking-tight select-none truncate"
                  style={{ fontFamily: option.stack }}
                >
                  Aa Bb Gg 123
                </div>

                <div
                  className="text-[11px] text-muted-foreground truncate leading-relaxed"
                  style={{ fontFamily: option.stack }}
                >
                  {option.previewText ?? 'Clean typography'}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        label="Master Font Weight"
        hint="Calibrates the typographic weight across all UI typography, panels, buttons, menus, and inspector fields."
      >
        <div
          className="relative grid grid-cols-5 rounded-2xl bg-well/90 p-1 ring-1 ring-border/50 shadow-inner"
          role="radiogroup"
          aria-label="Master Font weight"
        >
          {/* One marker that slides between stops */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-0 w-1/5 p-1 transition-transform duration-200 ease-smooth motion-reduce:transition-none"
            style={{ transform: `translateX(${fontWeightIndex * 100}%)` }}
          >
            <span className="block size-full rounded-xl bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-border/50" />
          </span>
          {UI_FONT_WEIGHTS.map((option) => {
            const selected = fontWeight === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  'relative z-10 flex h-14 flex-col items-center justify-center gap-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  setFontWeightState(option.value)
                  setUiFontWeight(option.value)
                }}
              >
                <span
                  aria-hidden="true"
                  className="leading-none text-base transition-all"
                  style={{ fontWeight: option.value }}
                >
                  Aa
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium leading-none">{option.label}</span>
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground opacity-75">
                    {option.value}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Live Weight Hierarchy Strip */}
        <div className="mt-2 grid grid-cols-4 gap-2 pt-2 border-t border-line/60">
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/40 p-2 border border-line/50">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">Normal</span>
            <span className="text-xs text-foreground font-normal truncate">Body & Labels</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/40 p-2 border border-line/50">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">Medium</span>
            <span className="text-xs text-foreground font-medium truncate">Controls & Tabs</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/40 p-2 border border-line/50">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">SemiBold</span>
            <span className="text-xs text-foreground font-semibold truncate">Actions & Pills</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/40 p-2 border border-line/50">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">Bold</span>
            <span className="text-xs text-foreground font-bold truncate">Headings & Titles</span>
          </div>
        </div>
      </Section>

      {showScale ? (
        <Section
          label="Interface size"
          hint="Scales menus, panels, and text. Designs keep their own size; use canvas zoom for those."
        >
          <div className="relative grid grid-cols-5 rounded-2xl bg-well/90 p-1 ring-1 ring-border/50 shadow-inner" role="radiogroup" aria-label="Interface size">
            {/* One marker that slides between stops */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-0 w-1/5 p-1 transition-transform duration-200 ease-smooth motion-reduce:transition-none"
              style={{ transform: `translateX(${scaleIndex * 100}%)` }}
            >
              <span className="block size-full rounded-xl bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-border/50" />
            </span>
            {UI_SCALES.map((option) => {
              const selected = scale === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    'relative z-10 flex h-14 flex-col items-center justify-center gap-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => {
                    setScale(option)
                    setUiScale(option)
                  }}
                >
                  <span aria-hidden="true" className="leading-none font-medium" style={{ fontSize: `${Math.round(option * 11)}px` }}>
                    Aa
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-inherit">{Math.round(option * 100)}%</span>
                  <span className="sr-only">{SCALE_LABELS[option]}</span>
                </button>
              )
            })}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

/** Sound on or off, and how loud, as five bars you can press. */
export function SoundSettings({ className }: { className?: string }) {
  const [sound, setSound] = useState<SoundPreference>(DEFAULT_SOUND)
  const [volume, setVolume] = useState<VolumeLevel>(DEFAULT_VOLUME)

  useEffect(() => {
    setSound(getSoundPreference())
    setVolume(getVolumePreference())
  }, [])

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <Section label="Sound" hint="Cues for taps, hovers, menus and finished work.">
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

      <Section label="Volume" hint="Press a bar. The sound you hear is the level you chose.">
        <div
          className={cn('flex h-14 items-end gap-2.5 rounded-xl bg-well/70 p-2.5 ring-1 ring-border/40 shadow-inner transition-opacity duration-200', sound === 'off' && 'opacity-40')}
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
                className="cx-press flex h-full flex-1 items-end outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                onClick={() => {
                  setVolume(level)
                  setVolumePreference(level)
                }}
              >
                <div
                  className={cn(
                    'w-full rounded-md transition-all duration-200',
                    reached
                      ? 'bg-cx-accent shadow-[0_1px_3px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.3)]'
                      : 'bg-muted-foreground/25 hover:bg-muted-foreground/40',
                  )}
                  style={{ height: `${28 + index * 18}%` }}
                />
              </button>
            )
          })}
        </div>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          Volume: <span className="font-medium text-foreground">{Math.round(volume * 100)}%</span>
        </p>
      </Section>
    </div>
  )
}
