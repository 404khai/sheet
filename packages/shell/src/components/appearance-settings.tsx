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

  useEffect(() => {
    setTheme(getThemePreference())
    setAccentState(getAccent())
    setScale(getUiScale())
  }, [])

  const scaleIndex = Math.max(0, UI_SCALES.indexOf(scale))

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
