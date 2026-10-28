import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  BotIcon,
  EllipsisIcon,
  LayoutGridIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from '@sheet/ui/icons'
import { Button } from '@sheet/ui/button'
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@sheet/ui/context-menu'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@sheet/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sheet/ui/dropdown-menu'
import { Loader } from '@sheet/ui/loader'
import { Skeleton } from '@sheet/ui/skeleton'
import { Spinner } from '@sheet/ui/spinner'
import { toastManager } from '@sheet/ui/toast'
import { cn } from '@sheet/ui/utils'
import { orpc } from '@sheet/rpc/client'
import { ConnectAgent } from '@sheet/editor/connect-agent'
import { WebDocumentPreview } from '@sheet/editor/web-preview'
import { createDesign, relativeTime, type DesignSummary } from '@sheet/editor/lib/designs'
import { subscribeCanvasChanges } from '@sheet/editor/lib/canvas-events'
import { useDesignPreview } from '@sheet/editor/lib/design-preview'
import { useCommandRegistry } from '@sheet/editor/lib/command-registry'
import { FreshnessMeter } from './freshness-meter'
import { NEW_FILE_CHORD, PALETTE_CHORD } from './command-menu'

const VIEW_KEY = 'sheet:files-view'
const SORT_KEY = 'sheet:files-sort'

type FilesView = 'grid' | 'list'
type FilesSort = 'recent' | 'name'

const SORTS = [
  { value: 'recent', label: 'Last edited' },
  { value: 'name', label: 'Name' },
] as const satisfies ReadonlyArray<{ value: FilesSort; label: string }>

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = globalThis.localStorage?.getItem(key)
    return allowed.find((value) => value === stored) ?? fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // The choice still holds for this session.
  }
}

const byRecent = (left: DesignSummary, right: DesignSummary) => right.updatedAt - left.updatedAt
const byName = (left: DesignSummary, right: DesignSummary) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })

const isScratchpad = (design: DesignSummary) => design.name.trim().toLowerCase() === 'scratchpad'

/** The design, drawn small. A mark appears only if the wait is long enough to notice. */
function DesignThumb({ design }: { design: DesignSummary }) {
  const preview = useDesignPreview(design.id, design.revision)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (preview.status !== 'loading') return
    const timer = window.setTimeout(() => setSlow(true), 200)
    return () => window.clearTimeout(timer)
  }, [preview.status])

  return (
    <span className="relative flex size-full items-center justify-center">
      {preview.status === 'loading' && slow ? <Loader label={null} className="text-muted-foreground" /> : null}
      <WebDocumentPreview document={preview.status === 'ready' ? preview.document : null} className="size-full" />
      {preview.status === 'empty' ? (
        <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">No preview</span>
      ) : null}
    </span>
  )
}

/** The name, or the field that renames it in place. */
function NameField({
  design,
  renaming,
  onRename,
  onCancel,
  className,
}: {
  design: DesignSummary
  renaming: boolean
  onRename: (name: string) => void
  onCancel: () => void
  className?: string
}) {
  if (!renaming) return <span className={cn('truncate', className)}>{design.name}</span>
  return (
    <input
      autoFocus
      aria-label="File name"
      defaultValue={design.name}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.preventDefault()}
      onBlur={(event) => onRename(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') onRename(event.currentTarget.value)
        if (event.key === 'Escape') onCancel()
      }}
      className={cn(
        'relative z-10 -mx-1 h-6 w-full min-w-0 rounded-md bg-surface px-1 text-foreground shadow-sunken outline-none ring-3 ring-cx-accent/20',
        className,
      )}
    />
  )
}

type FileActions = {
  onOpen: () => void
  onStartRename: () => void
  onArchive: () => void
}

/** Right-click on any file: the same three actions as its `…` menu, with their keys. */
function FileContextMenu({ actions, children }: { actions: FileActions; children: React.ReactElement }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuPopup className="w-44">
        <ContextMenuItem onClick={actions.onOpen}>Open</ContextMenuItem>
        <ContextMenuItem onClick={actions.onStartRename}>
          <PencilIcon />
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={actions.onArchive}>
          <Trash2Icon />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

/** The `…` button: the context menu for touch and keyboard, shown on hover with a mouse. */
function FileMenuButton({ design, actions }: { design: DesignSummary; actions: FileActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${design.name}`}
          className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,opacity,scale] duration-150 ease-smooth hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.92] data-[state=open]:bg-accent data-[state=open]:text-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 pointer-fine:data-[state=open]:opacity-100"
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={actions.onStartRename}>
          <PencilIcon data-slot="icon" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={actions.onArchive}>
          <Trash2Icon data-slot="icon" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A file as a card: the design first, the way a file is remembered, then its
 * name and age. It lifts under a mouse and presses in on click (`cx-tile`).
 * The link covers the card, so the whole card opens the file; the name is a
 * separate target only while it is being renamed.
 */
function FileCard({
  design,
  actions,
  renaming,
  onRename,
  onCancelRename,
  large = false,
  index,
}: {
  design: DesignSummary
  actions: FileActions
  renaming: boolean
  onRename: (name: string) => void
  onCancelRename: () => void
  large?: boolean
  index: number
}) {
  return (
    <FileContextMenu actions={actions}>
      <div
        className="cx-tile group relative flex flex-col rounded-xl bg-surface p-1.5 focus-within:ring-2 focus-within:ring-ring"
        style={{ '--i': index } as CSSProperties}
      >
        <Link
          to="/design/$id"
          params={{ id: design.id }}
          aria-label={`Open ${design.name}`}
          data-file-link={design.id}
          className="absolute inset-0 rounded-xl outline-none"
        />
        <div className={cn('pointer-events-none relative w-full overflow-hidden rounded-[10px] bg-cx-canvas shadow-sunken', large ? 'aspect-[16/9]' : 'aspect-[16/10]')}>
          <DesignThumb design={design} />
        </div>
        <div className="flex min-w-0 items-center gap-2 px-2 pb-1 pt-2.5">
          <div className="min-w-0 flex-1">
            <div className={cn('flex items-center gap-1.5 font-medium text-foreground', large ? 'text-sm' : 'text-[13px]', !renaming && 'pointer-events-none')}>
              <NameField design={design} renaming={renaming} onRename={onRename} onCancel={onCancelRename} />
              {isScratchpad(design) && !renaming ? <PencilIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
            </div>
            <p className="pointer-events-none mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FreshnessMeter updatedAt={design.updatedAt} />
              <span className="truncate tabular-nums">
                {isScratchpad(design) ? 'Your permanent draft' : `Edited ${relativeTime(design.updatedAt)}`}
              </span>
            </p>
          </div>
          <FileMenuButton design={design} actions={actions} />
        </div>
      </div>
    </FileContextMenu>
  )
}

/** A file as a row, for when there are many and names matter more than pictures. */
function FileRow({
  design,
  actions,
  renaming,
  onRename,
  onCancelRename,
  index,
}: {
  design: DesignSummary
  actions: FileActions
  renaming: boolean
  onRename: (name: string) => void
  onCancelRename: () => void
  index: number
}) {
  return (
    <FileContextMenu actions={actions}>
      <div
        className="group relative flex h-12 items-center gap-3 rounded-lg px-2 transition-colors duration-150 ease-smooth hover:bg-accent/60"
        style={{ '--i': index } as CSSProperties}
      >
        <Link
          to="/design/$id"
          params={{ id: design.id }}
          aria-label={`Open ${design.name}`}
          data-file-link={design.id}
          className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="pointer-events-none h-8 w-12 shrink-0 overflow-hidden rounded-md bg-cx-canvas shadow-sunken">
          <DesignThumb design={design} />
        </div>
        <div className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-foreground', !renaming && 'pointer-events-none')}>
          <NameField design={design} renaming={renaming} onRename={onRename} onCancel={onCancelRename} />
          {isScratchpad(design) && !renaming ? <PencilIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
        </div>
        <span className="pointer-events-none hidden w-32 shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground sm:flex">
          <FreshnessMeter updatedAt={design.updatedAt} />
          {isScratchpad(design) ? 'Permanent draft' : relativeTime(design.updatedAt)}
        </span>
        <FileMenuButton design={design} actions={actions} />
      </div>
    </FileContextMenu>
  )
}

/**
 * Arrow keys walk the file grid the way they walk any grid: left and right by
 * one, up and down by a row. The column count is read from the laid-out grid,
 * so it is right at every window width. F2 renames, Delete asks to delete.
 */
function onGridKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  files: readonly DesignSummary[],
  onRename: (design: DesignSummary) => void,
  onArchive: (design: DesignSummary) => void,
) {
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('[data-file-link]')]
  const index = links.findIndex((link) => link === document.activeElement)
  if (index === -1) return
  const current = files[index]
  if (event.key === 'F2' && current) {
    event.preventDefault()
    onRename(current)
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && current) {
    event.preventDefault()
    onArchive(current)
    return
  }
  const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length || 1
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
  const delta = step[event.key]
  if (delta === undefined) return
  const next = links[index + delta]
  if (!next) return
  event.preventDefault()
  next.focus()
}

/** The empty canvas plate: a frame that draws itself, then a mark, then its corners. */
function EmptyCanvasPlate() {
  const draw = (delay: number): CSSProperties => ({ ['--cx-draw-delay' as string]: `${delay}ms` })
  return (
    <svg aria-hidden="true" viewBox="0 0 176 112" className="mb-7 h-28 w-44 shrink-0 text-muted-foreground" fill="none">
      <rect className="cx-draw" pathLength="1" x="8.5" y="8.5" width="159" height="95" rx="6" stroke="currentColor" strokeOpacity="0.5" style={draw(0)} />
      <path className="cx-draw" pathLength="1" d="M88 42v28M74 56h28" stroke="var(--cx-accent)" strokeWidth="1.25" strokeLinecap="round" style={draw(380)} />
      <path className="cx-draw" pathLength="1" d="M8 20V8h12M156 8h12v12M168 92v12h-12M20 104H8V92" stroke="currentColor" strokeWidth="1.25" style={draw(560)} />
    </svg>
  )
}

/**
 * Home: where Sheet opens and where every file lives. One search reaches any
 * file or action (the palette), the last few files wait as large cards to pick
 * straight back up, and every file sits underneath, sortable, as a grid or a
 * list. An empty Home says the two ways in: start a file, or connect an agent.
 */
export function Home({
  initialSection,
  openSearch = false,
}: {
  /** `files` scrolls straight to the full list (the old Files page). */
  initialSection?: 'files'
  /** Open the palette on arrival (the old New tab page). */
  openSearch?: boolean
} = {}) {
  const navigate = useNavigate()
  const registry = useCommandRegistry()
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setViewState] = useState<FilesView>(() => readStored(VIEW_KEY, ['grid', 'list'], 'grid'))
  const [sort, setSortState] = useState<FilesSort>(() => readStored(SORT_KEY, ['recent', 'name'], 'recent'))
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<DesignSummary | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const filesRef = useRef<HTMLElement | null>(null)

  const loadDesigns = useCallback(async () => {
    try {
      const list = await orpc.design.list()
      setDesigns([...list])
      setError(null)
    } catch (cause) {
      setDesigns((current) => current ?? [])
      setError(cause instanceof Error ? cause.message : 'The local server did not answer.')
    }
  }, [])

  useEffect(() => {
    void loadDesigns()
    return subscribeCanvasChanges(null, () => void loadDesigns())
  }, [loadDesigns])

  useEffect(() => {
    if (initialSection === 'files' && designs) filesRef.current?.scrollIntoView({ block: 'start' })
  }, [initialSection, designs])

  useEffect(() => {
    if (openSearch) registry?.open()
  }, [openSearch, registry])

  const recent = useMemo(() => [...(designs ?? [])].sort(byRecent), [designs])
  const sorted = useMemo(() => [...(designs ?? [])].sort(sort === 'name' ? byName : byRecent), [designs, sort])
  const continueFiles = recent.length > 3 ? recent.slice(0, 3) : []

  const setView = (next: FilesView) => {
    setViewState(next)
    writeStored(VIEW_KEY, next)
  }
  const setSort = (next: FilesSort) => {
    setSortState(next)
    writeStored(SORT_KEY, next)
  }

  const newFile = async () => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createDesign()
      await navigate({ to: '/design/$id', params: { id: created.id } })
    } catch (cause) {
      setCreating(false)
      toastManager.add({
        type: 'error',
        title: 'The new file was not created',
        description: `${cause instanceof Error ? cause.message : 'The local server did not answer.'} Nothing else changed; try again.`,
      })
    }
  }

  const rename = async (design: DesignSummary, value: string) => {
    setRenamingId(null)
    const name = value.trim()
    if (!name || name === design.name) return
    // Show the new name at once; put the old one back if the server says no.
    setDesigns((current) => current?.map((item) => (item.id === design.id ? { ...item, name } : item)) ?? null)
    try {
      await orpc.webCanvas.rename({ designId: design.id, name })
    } catch (cause) {
      setDesigns((current) => current?.map((item) => (item.id === design.id ? { ...item, name: design.name } : item)) ?? null)
      toastManager.add({
        type: 'error',
        title: `“${design.name}” kept its name`,
        description: `${cause instanceof Error ? cause.message : 'The rename was not saved.'} The file itself is unchanged.`,
      })
    }
  }

  const archive = async () => {
    const target = archiveTarget
    if (!target || archiving) return
    setArchiving(true)
    try {
      await orpc.design.archive({ id: target.id })
      setDesigns((current) => current?.filter((design) => design.id !== target.id) ?? null)
      setArchiveTarget(null)
    } catch (cause) {
      toastManager.add({
        type: 'error',
        title: `“${target.name}” was not deleted`,
        description: `${cause instanceof Error ? cause.message : 'The local server did not answer.'} It is still in your files.`,
      })
    } finally {
      setArchiving(false)
    }
  }

  const actionsFor = (design: DesignSummary): FileActions => ({
    onOpen: () => void navigate({ to: '/design/$id', params: { id: design.id } }),
    onStartRename: () => setRenamingId(design.id),
    onArchive: () => setArchiveTarget(design),
  })

  const cardProps = (design: DesignSummary, index: number) => ({
    design,
    index,
    actions: actionsFor(design),
    renaming: renamingId === design.id,
    onRename: (name: string) => void rename(design, name),
    onCancelRename: () => setRenamingId(null),
  })

  return (
    <>
      <main className="app-page-enter mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 pb-20 sm:px-10">
        {/* One search for everything: it opens the palette. */}
        <div className="flex justify-center pb-10 pt-12 sm:pt-16">
          <button
            type="button"
            onClick={() => registry?.open()}
            data-cuelume-tap=""
            className="group flex h-12 w-full max-w-xl items-center gap-3 rounded-2xl bg-surface px-4 text-start text-sm text-muted-foreground shadow-lift outline-none transition-[box-shadow,color,scale] duration-200 ease-smooth hover:text-foreground hover:shadow-lift-hover active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SearchIcon className="size-4 shrink-0 transition-colors group-hover:text-foreground" />
            <span className="min-w-0 flex-1 truncate">Search files or run a command</span>
            <kbd className="shrink-0 rounded-md bg-well px-1.5 py-0.5 font-sans text-[11px] tabular-nums text-muted-foreground shadow-sunken">{PALETTE_CHORD}</kbd>
          </button>
        </div>

        {error ? (
          <div role="alert" className="app-page-enter mb-6 flex items-center gap-2 rounded-xl bg-destructive/8 px-3 py-2 text-xs text-destructive-foreground shadow-hairline">
            <span className="min-w-0 flex-1">Your files could not be listed: {error} Nothing was changed.</span>
            <Button size="xs" variant="outline" onClick={() => void loadDesigns()}>
              Try again
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setError(null)}>
              <XIcon />
            </Button>
          </div>
        ) : null}

        {designs === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4" aria-busy="true">
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="flex flex-col rounded-xl bg-surface p-1.5 shadow-lift">
                <Skeleton className="aspect-[16/10] w-full rounded-[10px]" />
                <div className="flex flex-col gap-1.5 px-2 pb-1.5 pt-3">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : designs.length === 0 ? (
          <div className="mx-auto flex w-full max-w-md flex-col items-center py-12 text-center">
            <EmptyCanvasPlate />
            <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">Design with your agent, or by hand</h1>
            <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
              Start a file and draw on the canvas, or connect an agent and let it build on the same document you see.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={() => void newFile()} disabled={creating} data-cuelume-tap="" title={`New file (${NEW_FILE_CHORD})`}>
                {creating ? <Spinner /> : <PlusIcon />}
                New file
              </Button>
              <Button size="lg" variant="outline" onClick={() => setAgentOpen(true)}>
                <BotIcon />
                Connect an agent
              </Button>
            </div>
          </div>
        ) : (
          <>
            {continueFiles.length > 0 ? (
              <section aria-labelledby="home-continue" className="mb-12">
                <h2 id="home-continue" className="mb-3 px-1 text-[13px] font-semibold tracking-tight text-foreground">
                  Continue
                </h2>
                <div className="cx-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {continueFiles.map((design, index) => (
                    <FileCard key={design.id} large {...cardProps(design, index)} />
                  ))}
                </div>
              </section>
            ) : null}

            <section ref={filesRef} aria-labelledby="home-files" className="scroll-mt-6">
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
                <h2 id="home-files" className="text-[13px] font-semibold tracking-tight text-foreground">
                  All files
                </h2>
                <span key={designs.length} className="cx-swap text-xs tabular-nums text-muted-foreground">
                  {designs.length}
                </span>
                <div className="ms-auto flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground outline-none transition-[background-color,color] duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
                      >
                        <span className="text-muted-foreground/80">Sort</span>
                        <span className="text-foreground">{SORTS.find((option) => option.value === sort)?.label}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {SORTS.map((option) => (
                        <DropdownMenuItem key={option.value} onClick={() => setSort(option.value)}>
                          <span className="flex-1">{option.label}</span>
                          {sort === option.value ? <span className="size-1.5 rounded-full bg-cx-accent" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Grid or list: two stops in a sunken track, one raised thumb that glides between them. */}
                  <div role="radiogroup" aria-label="Layout" className="relative grid shrink-0 grid-cols-2 rounded-lg bg-well p-0.5 shadow-sunken">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0.5 start-0.5 w-[calc(50%-0.125rem)] rounded-md bg-surface shadow-raised transition-transform duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
                      style={{ transform: `translateX(${view === 'list' ? 100 : 0}%)` }}
                    />
                    {(
                      [
                        { id: 'grid', label: 'Grid view', Icon: LayoutGridIcon },
                        { id: 'list', label: 'List view', Icon: ListIcon },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-label={label}
                        title={label}
                        data-cuelume-select=""
                        aria-checked={view === id}
                        onClick={() => setView(id)}
                        className={cn(
                          'relative z-10 grid h-6 w-7 place-items-center rounded-md outline-none transition-[color,scale] duration-150 ease-smooth active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-ring',
                          view === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    ))}
                  </div>

                  <Button onClick={() => void newFile()} disabled={creating} data-cuelume-tap="" title={`New file (${NEW_FILE_CHORD})`}>
                    {creating ? <Spinner /> : <PlusIcon />}
                    New file
                  </Button>
                </div>
              </div>

              <div key={`${view}:${sort}`} className="app-page-enter">
                {view === 'grid' ? (
                  <div
                    className="cx-stagger grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4"
                    onKeyDown={(event) => onGridKeyDown(event, sorted, (design) => setRenamingId(design.id), setArchiveTarget)}
                  >
                    {sorted.map((design, index) => (
                      <FileCard key={design.id} {...cardProps(design, index)} />
                    ))}
                  </div>
                ) : (
                  <div
                    className="cx-stagger grid grid-cols-1 rounded-xl bg-surface p-1.5 shadow-lift"
                    onKeyDown={(event) => onGridKeyDown(event, sorted, (design) => setRenamingId(design.id), setArchiveTarget)}
                  >
                    {sorted.map((design, index) => (
                      <FileRow key={design.id} {...cardProps(design, index)} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <Dialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{archiveTarget?.name}”?</DialogTitle>
            <DialogDescription>It leaves your files. Its data stays in the archive.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={archiving} onClick={() => void archive()}>
              {archiving ? <Spinner /> : <Trash2Icon />}
              Delete
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect your agent</DialogTitle>
            <DialogDescription>Sheet runs a local MCP server. Pick your agent and follow the steps.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
            <ConnectAgent />
          </div>
        </DialogPopup>
      </Dialog>
    </>
  )
}
