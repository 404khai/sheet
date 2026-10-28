import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CommandDialog, CommandDialogPopup } from '@sheet/ui/command'
import {
  File01Icon,
  HomeIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { orpc } from '@sheet/rpc/client'
import { createDesign, relativeTime, type DesignSummary } from '@sheet/editor/lib/designs'
import { formatChord } from '@sheet/editor/lib/shortcuts'
import {
  CommandRegistryContext,
  type AppCommand,
  type CommandRegistry,
} from '@sheet/editor/lib/command-registry'
import { toastManager } from '@sheet/ui/toast'
import { getThemePreference, resolveTheme, setThemePreference } from '../lib/theme'
import { openSettingsWindow } from '../lib/settings-window'

export const PALETTE_CHORD = formatChord({ key: 'k', meta: true })
export const NEW_FILE_CHORD = formatChord({ key: 'n', meta: true })

type Row =
  | { kind: 'file'; id: string; design: DesignSummary }
  | { kind: 'command'; id: string; group: 'Actions' | 'Here'; command: AppCommand }

/**
 * How well `query` matches `text`: every query character in order, with a
 * bonus for runs and word starts. 0 means no match. Small on purpose: the
 * lists here are tens of entries, not thousands.
 */
function score(text: string, query: string) {
  if (!query) return 1
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle)
  let total = 0
  let from = 0
  let previous = -2
  for (const char of needle) {
    const at = haystack.indexOf(char, from)
    if (at === -1) return 0
    total += at === previous + 1 ? 3 : at === 0 || haystack[at - 1] === ' ' ? 2 : 1
    previous = at
    from = at + 1
  }
  return total
}

/**
 * The command palette and the registry screens add to. ⌘K / Ctrl+K opens it
 * from anywhere; so does the search field on Home. One list answers both
 * "where is that file" and "how do I do that", ranked by how well each matches.
 * ⌘N / Ctrl+N makes a new file from anywhere without opening it.
 */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [designs, setDesigns] = useState<DesignSummary[]>([])
  const [sources, setSources] = useState<ReadonlyMap<string, readonly AppCommand[]>>(new Map())
  const listRef = useRef<HTMLDivElement | null>(null)

  const registry = useMemo<CommandRegistry>(
    () => ({
      register: (source, commands) =>
        setSources((current) => new Map(current).set(source, commands)),
      unregister: (source) =>
        setSources((current) => {
          const next = new Map(current)
          next.delete(source)
          return next
        }),
      open: () => setOpen(true),
    }),
    [],
  )

  const newFile = useCallback(async () => {
    try {
      const created = await createDesign()
      await navigate({ to: '/design/$id', params: { id: created.id } })
    } catch (cause) {
      toastManager.add({
        type: 'error',
        title: 'The new file was not created',
        description: `${cause instanceof Error ? cause.message : 'The local server did not answer.'} Nothing else changed; try again.`,
      })
    }
  }, [navigate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      } else if (key === 'n') {
        event.preventDefault()
        void newFile()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newFile])

  // The file list is read each time the palette opens, so it is never stale.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlight(0)
    let active = true
    void orpc.design
      .list()
      .then((list) => {
        if (active) setDesigns([...list].sort((a, b) => b.updatedAt - a.updatedAt))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [open])

  const actions = useMemo<AppCommand[]>(() => {
    const dark = resolveTheme(getThemePreference()) === 'dark'
    return [
      { id: 'new-file', label: 'New file', shortcut: NEW_FILE_CHORD, icon: <PlusIcon />, run: () => void newFile() },
      { id: 'home', label: 'Go to Home', keywords: 'files recents dashboard', icon: <HomeIcon />, run: () => void navigate({ to: '/app' }) },
      { id: 'settings', label: 'Open Settings', keywords: 'preferences appearance', shortcut: formatChord({ key: ',', meta: true }), icon: <SettingsIcon />, run: openSettingsWindow },
      {
        id: 'theme',
        label: dark ? 'Switch to light theme' : 'Switch to dark theme',
        keywords: 'theme appearance mode',
        icon: dark ? <SunIcon /> : <MoonIcon />,
        run: () => setThemePreference(dark ? 'light' : 'dark'),
      },
    ]
    // `open` is a dependency on purpose: the theme label is re-read each time the palette opens.
  }, [newFile, navigate, open])

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim()
    const here = [...sources.values()].flat()
    const commandRows = [
      ...here.map((command) => ({ group: 'Here' as const, command })),
      ...actions.map((command) => ({ group: 'Actions' as const, command })),
    ]
      .map((entry) => ({ entry, rank: score(`${entry.command.label} ${entry.command.keywords ?? ''}`, needle) }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => (needle ? b.rank - a.rank : 0))
      .map(({ entry }): Row => ({ kind: 'command', id: `command:${entry.command.id}`, group: entry.group, command: entry.command }))
    const fileRows = designs
      .map((design) => ({ design, rank: score(design.name, needle) }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => (needle ? b.rank - a.rank : 0))
      .slice(0, needle ? 8 : 5)
      .map(({ design }): Row => ({ kind: 'file', id: `file:${design.id}`, design }))
    // With nothing typed, recent files lead; once typing, actions lead when they match.
    return needle ? [...commandRows, ...fileRows] : [...fileRows, ...commandRows]
  }, [actions, designs, query, sources])

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, rows.length - 1)))
  }, [rows.length])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const run = (row: Row | undefined) => {
    if (!row) return
    setOpen(false)
    if (row.kind === 'file') void navigate({ to: '/design/$id', params: { id: row.design.id } })
    else row.command.run()
  }

  let lastGroup: string | null = null

  return (
    <CommandRegistryContext.Provider value={registry}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup className="max-h-[min(30rem,70vh)] max-w-xl" aria-label="Command menu">
          <label className="flex h-13 shrink-0 items-center gap-3 border-b border-line px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              placeholder="Search files and actions"
              aria-label="Search files and actions"
              aria-controls="command-menu-list"
              aria-activedescendant={rows[highlight] ? `command-menu-${highlight}` : undefined}
              role="combobox"
              aria-expanded="true"
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlight(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlight((current) => Math.min(rows.length - 1, current + 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlight((current) => Math.max(0, current - 1))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  run(rows[highlight])
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <kbd className="shrink-0 rounded-md bg-well px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground shadow-sunken">Esc</kbd>
          </label>

          <div ref={listRef} id="command-menu-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <p className="px-3 py-10 text-center text-xs text-muted-foreground">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              rows.map((row, index) => {
                const group = row.kind === 'file' ? (query.trim() ? 'Files' : 'Recent files') : row.group === 'Here' ? 'In this file' : 'Actions'
                const heading = group !== lastGroup ? group : null
                lastGroup = group
                const active = index === highlight
                return (
                  <div key={row.id}>
                    {heading ? (
                      <p className="px-2.5 pb-1 pt-2.5 text-[11px] text-muted-foreground first:pt-1">{heading}</p>
                    ) : null}
                    <div
                      id={`command-menu-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={active}
                      onPointerMove={() => setHighlight(index)}
                      onClick={() => run(row)}
                      className={cn(
                        'flex h-9 cursor-default select-none items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors duration-75',
                        active ? 'bg-accent text-foreground' : 'text-foreground/90',
                      )}
                    >
                      <span className={cn('grid size-4 shrink-0 place-items-center [&_svg]:size-4', active ? 'text-foreground' : 'text-muted-foreground')}>
                        {row.kind === 'file' ? <File01Icon /> : row.command.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.kind === 'file' ? row.design.name : row.command.label}</span>
                      {row.kind === 'file' ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relativeTime(row.design.updatedAt)}</span>
                      ) : row.command.shortcut ? (
                        <kbd className="shrink-0 font-sans text-[11px] tabular-nums text-muted-foreground">{row.command.shortcut}</kbd>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-4 text-[11px] text-muted-foreground">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span className="ms-auto">{PALETTE_CHORD} to close</span>
          </div>
        </CommandDialogPopup>
      </CommandDialog>
    </CommandRegistryContext.Provider>
  )
}
