import { useEffect, useState, type ReactNode } from 'react'
import { orpc } from '@sheet/rpc/client'
import { ConnectAgent } from '@sheet/editor/connect-agent'
import {
  cacheShortcuts,
  loadCachedShortcuts,
  normalizeConfig,
  type ShortcutConfig,
} from '@sheet/editor/lib/shortcuts'
import { cn } from '@sheet/ui/utils'
import { AppearanceSettings, SoundSettings } from './appearance-settings'
import { GeneralSettings } from './general-settings'
import { ShortcutsSettings } from './shortcuts-settings'
import { UpdatesSettings } from './updates-settings'

type SectionId = 'general' | 'appearance' | 'agents' | 'sound' | 'shortcuts' | 'updates'

/**
 * Each section's mark, drawn on a 16px grid. The one in use draws itself in, so
 * the nav says where you are with a shape as well as a colour.
 */
function Glyph({ id, active }: { id: SectionId; active: boolean }) {
  const draw = active ? 'cx-draw' : undefined
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25 } as const
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0">
      {id === 'general' ? (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" {...props} />
          <path className={draw} pathLength="1" d="M5 6h6M5 10h4" {...props} />
        </>
      ) : null}
      {id === 'appearance' ? (
        <>
          <circle cx="8" cy="8" r="5.5" {...props} />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
        </>
      ) : null}
      {id === 'sound' ? (
        <path className={draw} pathLength="1" d="M3 10V6M6 12.5v-9M9 11V5M12 9.5v-3" {...props} />
      ) : null}
      {id === 'shortcuts' ? (
        <>
          <rect x="2.5" y="3.5" width="11" height="9" {...props} />
          <path className={draw} pathLength="1" d="M5 8h6" {...props} />
        </>
      ) : null}
      {id === 'updates' ? (
        <path className={draw} pathLength="1" d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" {...props} />
      ) : null}
      {id === 'agents' ? (
        <>
          <rect x="2" y="2" width="5" height="5" {...props} />
          <rect x="9" y="9" width="5" height="5" {...props} />
          <path className={draw} pathLength="1" d="M7 4.5h2.5V9" {...props} />
        </>
      ) : null}
    </svg>
  )
}

const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; title: string }> = [
  { id: 'general', label: 'General', title: 'How Sheet behaves' },
  { id: 'appearance', label: 'Appearance', title: 'How Sheet looks' },
  { id: 'agents', label: 'Agents', title: 'Connect an agent' },
  { id: 'sound', label: 'Sound', title: 'What Sheet sounds like' },
  { id: 'shortcuts', label: 'Shortcuts', title: 'Keys, your way' },
  { id: 'updates', label: 'Updates', title: 'Keep Sheet current' },
]

/** Shortcuts, loaded from and saved to the account the same way the editor reads them. */
function ShortcutsSection() {
  const [config, setConfig] = useState<ShortcutConfig>(loadCachedShortcuts)

  useEffect(() => {
    let cancelled = false
    void orpc.preferences
      .get()
      .then((preferences) => {
        if (cancelled) return
        const next = normalizeConfig(preferences.shortcuts)
        setConfig(next)
        cacheShortcuts(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ShortcutsSettings
      config={config}
      onChange={(next) => {
        const normalized = normalizeConfig(next)
        setConfig(normalized)
        cacheShortcuts(normalized)
        void orpc.preferences.save({ shortcuts: normalized }).catch(() => undefined)
      }}
    />
  )
}

function Body({ section }: { section: SectionId }): ReactNode {
  switch (section) {
    case 'general':
      return <GeneralSettings />
    case 'appearance':
      return <AppearanceSettings />
    case 'sound':
      return <SoundSettings />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'agents':
      return <ConnectAgent />
    case 'updates':
      return <UpdatesSettings />
  }
}

/**
 * The Settings window. It is opened from the application menu (or ⌘,) and from
 * nowhere inside the interface, so it is its own screen: a short list of
 * sections on the left, one section at a time on the right. When the window is
 * narrow (or the interface is scaled up) the list folds to a rail of glyphs.
 */
export function SettingsWindow() {
  const [section, setSection] = useState<SectionId>('general')
  const index = Math.max(0, SECTIONS.findIndex((entry) => entry.id === section))
  const current = SECTIONS[index] ?? SECTIONS[0]

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground antialiased selection:bg-cx-accent/20 selection:text-cx-accent">
      {/* No bar of its own. macOS draws this window with an overlay title bar,
          so each column starts with a 40px strip to drag by, in its own colour,
          with the traffic lights sitting in the nav's. Windows and Linux keep a
          native bar that already says "Settings", so the strips are absent. */}
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="relative flex w-15 shrink-0 flex-col gap-1 border-e border-line bg-frame px-2.5 pb-2.5 pt-2.5 sm:w-52 in-data-[os=mac]:pt-0"
        >
          <div data-tauri-drag-region aria-hidden="true" className="hidden h-10 shrink-0 in-data-[os=mac]:block" />
          {/* One raised pill that glides to the section in use. Rows are 2.25rem with a 0.25rem gap. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2.5 top-2.5 h-9 rounded-xl bg-surface shadow-lift transition-transform duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] in-data-[os=mac]:top-11"
            style={{ transform: `translateY(calc(${index} * 2.5rem))` }}
          />
          {SECTIONS.map((entry) => {
            const active = entry.id === section
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                title={entry.label}
                className={cn(
                  'group relative flex h-9 w-full items-center justify-center gap-3 rounded-xl text-start text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring sm:justify-start sm:px-3',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-surface/50 hover:text-foreground',
                )}
                onClick={() => setSection(entry.id)}
              >
                <span
                  className={cn(
                    'transition-[color,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-active:scale-[0.9]',
                    active ? 'text-cx-accent' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  <Glyph id={entry.id} active={active} />
                </span>
                <span className="sr-only sm:not-sr-only sm:truncate">{entry.label}</span>
              </button>
            )
          })}
        </nav>

        {/* A stable gutter, so a section that grows past the fold never nudges the page sideways. */}
        <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div data-tauri-drag-region aria-hidden="true" className="sticky top-0 z-10 hidden h-10 bg-background in-data-[os=mac]:block" />
          {/* Re-keyed per section so each one arrives instead of swapping. */}
          <div key={section} className="app-page-enter mx-auto w-full max-w-xl px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
            <div className="px-1 pb-5 sm:pb-6">
              <h2 className="text-xl font-semibold tracking-tight text-balance text-foreground">{current.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{current.title}</p>
            </div>
            <Body section={section} />
          </div>
        </main>
      </div>
    </div>
  )
}
