import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@sheet/ui/avatar'
import { SettingsIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { DocumentTabBar } from '@sheet/editor/tab-bar'
import { ChromeSlotsContext } from '@sheet/editor/chrome-slots'
import { CommandMenuProvider } from './command-menu'
import { ThemeSwitch } from './theme-toggle'
import { openSettingsWindow } from '../lib/settings-window'
import { useDesktopProfile } from '../lib/desktop-profile'

/** A quiet key on the title bar: flat until hovered, pressed in on click. */
const BAR_KEY =
  'grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-surface/60 hover:text-foreground active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-ring'

/** The right end of the title bar: theme, Settings, and who is here. */
function BarControls() {
  const profile = useDesktopProfile()
  const firstName = profile?.firstName ?? ''
  const initial = firstName.charAt(0).toUpperCase() || '·'

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ThemeSwitch />
      {/* Settings is its own window; this opens it, as the menu item does. */}
      <button type="button" onClick={openSettingsWindow} aria-label="Settings" title="Settings" data-cuelume-tap="" className={BAR_KEY}>
        <SettingsIcon className="size-3.5" />
      </button>
      <Avatar
        title={firstName || undefined}
        className="ms-2 size-6 shrink-0 rounded-full text-[10px] font-semibold outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      >
        {profile?.imageUrl ? <AvatarImage src={profile.imageUrl} alt="" /> : null}
        <AvatarFallback className="bg-cx-accent text-white">{initial}</AvatarFallback>
      </Avatar>
    </div>
  )
}

/**
 * The frame every screen sits in: one title bar, then the screen, edge to
 * edge. The bar holds Home, the open files as tabs, `+`, and on the right
 * theme, Settings and the profile. There is no sidebar: Home is the
 * file browser, and the palette (⌘K / Ctrl+K) reaches any file or action.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isEditor = pathname.startsWith('/design')
  const [leading, setLeading] = useState<HTMLElement | null>(null)
  const [trailing, setTrailing] = useState<HTMLElement | null>(null)
  const slots = useMemo(() => ({ leading, trailing }), [leading, trailing])

  return (
    <ChromeSlotsContext.Provider value={slots}>
      <CommandMenuProvider>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <header
            data-tauri-drag-region
            data-cuelume-theme="mech"
            className={cn(
              // macOS: clear the traffic lights (18px inset + three buttons + gaps).
              // Elsewhere the native title bar sits above.
              'flex h-11 shrink-0 select-none items-center gap-3 ps-3 pe-3 in-data-[os=mac]:ps-[88px]',
              // No rule and no tone of its own: the bar is the top of whatever is
              // under it — the page on Home, the editor's toolbar in a file.
              isEditor ? 'bg-surface' : 'bg-background',
            )}
          >
            {isEditor ? <div ref={setLeading} className="flex shrink-0 items-center" /> : null}
            <DocumentTabBar />
            <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
            {isEditor ? <div ref={setTrailing} className="flex shrink-0 items-center gap-1.5" /> : null}
            <BarControls />
          </header>

          <div className={cn('relative min-h-0 flex-1', isEditor ? 'overflow-hidden' : 'overflow-y-auto [scrollbar-gutter:stable]')}>
            {children}
          </div>
        </div>
      </CommandMenuProvider>
    </ChromeSlotsContext.Provider>
  )
}
