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
import { ShortcutsSettings } from './shortcuts-settings'
import { UpdatesSettings } from './updates-settings'

type SectionId = 'appearance' | 'sound' | 'shortcuts' | 'agents' | 'updates'

/**
 * Each section's mark, drawn on a 16px grid. The one in use draws itself in, so
 * the nav says where you are with a shape as well as a colour.
 */
function Glyph({ id, active }: { id: SectionId; active: boolean }) {
  const draw = active ? 'cx-draw' : undefined
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25 } as const
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0">
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
  { id: 'appearance', label: 'Appearance', title: 'How Sheet looks' },
  { id: 'sound', label: 'Sound', title: 'What Sheet sounds like' },
  { id: 'shortcuts', label: 'Shortcuts', title: 'Keys, your way' },
  { id: 'agents', label: 'Agents', title: 'Connect an agent' },
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
 * nowhere inside the interface, so it is its own screen: a title bar to drag, a
 * short list of sections on the left, one section at a time on the right.
 */
export function SettingsWindow() {
  const [section, setSection] = useState<SectionId>('appearance')
  const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground antialiased selection:bg-cx-accent/20 selection:text-cx-accent">
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 select-none items-center justify-center border-b border-line bg-frame/90 backdrop-blur-xl"
      >
        <div data-tauri-drag-region className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-cx-accent/80 shadow-[0_0_6px_var(--cx-accent)]" />
          <h1 data-tauri-drag-region className="font-mono text-xs font-medium tracking-tight text-foreground">
            Settings
          </h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings sections" className="w-52 shrink-0 border-e border-line bg-frame/60 p-2.5 space-y-1">
          {SECTIONS.map((entry) => {
            const active = entry.id === section
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 w-full items-center gap-3 px-3 text-start text-xs outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-surface text-foreground font-medium rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.09)] ring-1 ring-border/50 scale-[1.01]'
                    : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground rounded-xl active:scale-[0.98]',
                )}
                onClick={() => setSection(entry.id)}
              >
                <span className={cn('transition-all duration-150', active ? 'text-cx-accent scale-110' : 'text-muted-foreground')}>
                  <Glyph id={entry.id} active={active} />
                </span>
                <span className="truncate">{entry.label}</span>
              </button>
            )
          })}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Re-keyed per section so each one arrives instead of swapping. */}
          <div key={section} className="app-page-enter mx-auto w-full max-w-xl px-8 pb-16 pt-8">
            <div className="border-b border-line/60 pb-5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{entryTitle(current)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{current.title}</p>
            </div>
            <div className="mt-7">
              <Body section={section} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function entryTitle(entry: { label: string; title: string }) {
  return entry.label
}
