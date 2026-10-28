import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import {
  getThemePreference,
  resolveTheme,
  setThemePreference,
  type ThemeId,
} from '../lib/theme'

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies ReadonlyArray<{ value: ThemeId; label: string }>

/**
 * Light or dark as one icon key for the title bar. The sun and the moon are
 * both mounted and cross-fade out of a blur, so the switch reads as a turn,
 * not a swap. It follows a change made anywhere else (Settings, the palette).
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeId>(() => resolveTheme(getThemePreference()))
  const dark = mode === 'dark'

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setMode(root.classList.contains('dark') ? 'dark' : 'light'))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const icon = 'absolute size-3.5 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]'
  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      data-cuelume-select=""
      className={cn(
        'relative grid size-7 place-items-center rounded-lg text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-surface/60 hover:text-foreground active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => {
        const next: ThemeId = dark ? 'light' : 'dark'
        setMode(next)
        setThemePreference(next)
      }}
    >
      <SunIcon className={cn(icon, dark ? 'scale-100 opacity-100 blur-[0px]' : 'scale-[0.25] opacity-0 blur-[4px]')} />
      <MoonIcon className={cn(icon, dark ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-[0px]')} />
    </button>
  )
}

/**
 * Light or dark, as two words in a sunken track with one raised thumb that
 * glides to the pick — the same control as every other either/or in the app.
 * The pick applies at once and is remembered like any theme choice.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeId>(() => resolveTheme(getThemePreference()))
  const index = Math.max(0, OPTIONS.findIndex((option) => option.value === mode))

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('relative grid h-7 w-28 grid-cols-2 rounded-lg bg-well p-0.5 shadow-sunken', className)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0.5 start-0.5 w-[calc(50%-0.125rem)] rounded-md bg-surface shadow-raised transition-transform duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          data-cuelume-select=""
          className={cn(
            'relative z-10 rounded-md text-[11px] outline-none transition-[color,scale] duration-150 ease-smooth active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-ring',
            mode === option.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => {
            setMode(option.value)
            setThemePreference(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
