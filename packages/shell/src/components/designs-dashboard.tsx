import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  EllipsisIcon,
  LayoutGridIcon,
  SearchIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from '@sheet/ui/icons'
import { Button } from '@sheet/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
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
import { Input } from '@sheet/ui/input'
import { Loader } from '@sheet/ui/loader'
import { Skeleton } from '@sheet/ui/skeleton'
import { Spinner } from '@sheet/ui/spinner'
import { FreshnessMeter } from './freshness-meter'
import { ThemeToggle } from './theme-toggle'
import { orpc } from '@sheet/rpc/client'
import { createDesign, relativeTime, type DesignSummary } from '@sheet/editor/lib/designs'
import { WebDocumentPreview } from '@sheet/editor/web-preview'
import type { WebDocument } from '@sheet/canvas/web-model'
import { cn } from '@sheet/ui/utils'
import { useDashboardSearchQuery } from '../lib/dashboard-search'
import { subscribeCanvasChanges } from '@sheet/editor/lib/canvas-events'

const VIEW_STORAGE_KEY = 'sheet:files-view'

type FilesView = 'grid' | 'list'

function initialView(): FilesView {
  if (typeof window === 'undefined') return 'grid'
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'
}

function byRecent(left: DesignSummary, right: DesignSummary) {
  return right.updatedAt - left.updatedAt
}

function ActionsTrigger({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        className={cn(
          'flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground',
          className,
        )}
      >
        <EllipsisIcon className="size-3" />
      </button>
    </DropdownMenuTrigger>
  )
}

function FileActions({
  name,
  onRename,
  onArchive,
  className,
}: {
  name: string
  onRename: () => void
  onArchive: () => void
  className?: string
}) {
  return (
    <DropdownMenu>
      <ActionsTrigger name={name} className={className} />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}>
          <PencilIcon data-slot="icon" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onArchive}>
          <Trash2Icon data-slot="icon" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const previewCache = new Map<string, WebDocument | null>()

function FileCardPreview({ designId, revision }: { designId: string; revision: number }) {
  const cacheKey = `${designId}:${revision}`
  const [doc, setDoc] = useState<WebDocument | null>(() => previewCache.get(cacheKey) ?? null)
  const [loaded, setLoaded] = useState(() => previewCache.has(cacheKey))
  // Local fetches usually resolve in a frame or two; only show the mark when
  // the wait is long enough to notice.
  const [showLoader, setShowLoader] = useState(false)

  useEffect(() => {
    if (loaded) return
    const timer = window.setTimeout(() => setShowLoader(true), 200)
    return () => window.clearTimeout(timer)
  }, [loaded])

  useEffect(() => {
    if (typeof orpc.webCanvas?.get !== 'function') return
    if (previewCache.has(cacheKey)) return
    let active = true
    void orpc.webCanvas
      .get({ designId })
      .then((res) => {
        const document = res.status === 'ready' ? res.document : null
        previewCache.set(cacheKey, document)
        if (active) {
          setDoc(document)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [cacheKey, designId])

  return (
    <span className="relative flex size-full items-center justify-center">
      {!loaded && showLoader ? (
        <Loader label={null} className="text-muted-foreground" />
      ) : null}
      <WebDocumentPreview
        document={doc}
        className="size-full"
      />
      {loaded && !doc ? (
        <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">No preview</span>
      ) : null}
    </span>
  )
}

function FileCard({
  design,
  onRename,
  onArchive,
}: {
  design: DesignSummary
  onRename: () => void
  onArchive: () => void
}) {
  const isScratchpad = design.name.trim().toLowerCase() === 'scratchpad'

  return (
    <div className="group relative flex flex-col rounded-2xl border border-line/70 bg-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 ease-smooth active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] focus-within:ring-2 focus-within:ring-cx-accent">
      <Link
        to="/design/$id"
        params={{ id: design.id }}
        aria-label={`Open ${design.name}`}
        className="absolute inset-0 rounded-2xl outline-none"
      />
      <div className="flex items-start justify-between min-w-0">
        <div className="min-w-0 flex-1 pe-2">
          <p className="cx-label flex items-center gap-2">
            <FreshnessMeter updatedAt={design.updatedAt} />
            <span className="truncate">
              {isScratchpad ? 'Your permanent draft' : `Edited ${relativeTime(design.updatedAt)}`}
            </span>
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{design.name}</span>
            {isScratchpad ? (
              <PencilIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
          </div>
        </div>
        <FileActions
          name={design.name}
          onRename={onRename}
          onArchive={onArchive}
          className="relative z-10 shrink-0 opacity-0 transition-all duration-150 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 hover:scale-105 active:scale-95"
        />
      </div>

      <div className="pointer-events-none relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-xl border border-line/60 bg-cx-canvas shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
        <div className="size-full">
          <FileCardPreview key={design.revision} designId={design.id} revision={design.revision} />
        </div>
      </div>
    </div>
  )
}

function FileRow({
  design,
  onRename,
  onArchive,
}: {
  design: DesignSummary
  onRename: () => void
  onArchive: () => void
}) {
  const isScratchpad = design.name.trim().toLowerCase() === 'scratchpad'

  return (
    <div className="cx-row group flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0 transition-colors duration-fast ease-out hover:bg-accent/50 motion-reduce:transition-none">
      <Link
        to="/design/$id"
        params={{ id: design.id }}
        aria-label={`Open ${design.name}`}
        className="absolute inset-0 outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
      />
      <div className="pointer-events-none size-10 shrink-0 overflow-hidden rounded-lg border border-line/60 bg-cx-canvas shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
        <FileCardPreview key={design.revision} designId={design.id} revision={design.revision} />
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="cx-label truncate">
          {isScratchpad ? 'Your permanent draft' : `Edited ${relativeTime(design.updatedAt)}`}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="truncate text-sm text-foreground">{design.name}</span>
          {isScratchpad ? (
            <PencilIcon className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
        </div>
      </div>
      <FreshnessMeter updatedAt={design.updatedAt} className="pointer-events-none hidden sm:block" />
      <FileActions
        name={design.name}
        onRename={onRename}
        onArchive={onArchive}
        className="relative z-10 shrink-0 opacity-0 transition-all duration-150 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 hover:scale-105 active:scale-95"
      />
    </div>
  )
}

const GRID_CLASSES = 'grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 cx-stagger'

/**
 * The empty state, drawn in the same language as the canvas it invites you
 * onto: the dot ground, a plate, and the bar of a frame waiting to be filled.
 * It is chrome, not an illustration — no gradient, no accent, nothing that
 * competes with the first real card for attention.
 */
function EmptyCanvasPlate() {
  const draw = (delay: number): CSSProperties => ({ ['--cx-draw-delay' as string]: `${delay}ms` })
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 176 112"
      className="mb-6 h-28 w-44 shrink-0 text-muted-foreground"
      fill="none"
    >
      {/* The frame draws itself, then the mark inside it, then the corners. */}
      <rect
        className="cx-draw"
        pathLength="1"
        x="8.5"
        y="8.5"
        width="159"
        height="95"
        rx="6"
        stroke="currentColor"
        strokeOpacity="0.5"
        style={draw(0)}
      />
      <path
        className="cx-draw"
        pathLength="1"
        d="M88 42v28M74 56h28"
        stroke="var(--cx-accent)"
        strokeWidth="1.25"
        strokeLinecap="round"
        style={draw(380)}
      />
      <path
        className="cx-draw"
        pathLength="1"
        d="M8 20V8h12M156 8h12v12M168 92v12h-12M20 104H8V92"
        stroke="currentColor"
        strokeWidth="1.25"
        style={draw(560)}
      />
    </svg>
  )
}

function FilesLoading({ view }: { view: FilesView }) {
  const rows = Array.from({ length: view === 'grid' ? 6 : 6 }, (_, index) => index)
  if (view === 'list') {
    return (
      <div className="overflow-hidden rounded-xl bg-surface shadow-panel" aria-busy="true">
        {rows.map((row) => (
          <div key={row} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={GRID_CLASSES} aria-busy="true">
      {rows.map((row) => (
        <div key={row} className="flex flex-col rounded-xl bg-surface p-3 shadow-panel">
          <div className="flex flex-col gap-1.5 pb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-4 aspect-[16/10] w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}

/**
 * The file browser at `/app`.
 */
export function DesignsDashboard({
  title = 'Recents',
}: {
  title?: string
} = {}) {
  const navigate = useNavigate()
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useDashboardSearchQuery()
  const [view, setView] = useState<FilesView>(initialView)
  const [creating, setCreating] = useState(false)
  const [renameTarget, setRenameTarget] = useState<DesignSummary | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<DesignSummary | null>(null)
  const [archiving, setArchiving] = useState(false)

  const loadDesigns = useCallback(async () => {
    setError(null)
    try {
      const own = await orpc.design.list()
      setDesigns([...own].sort(byRecent))
    } catch (cause) {
      setDesigns([])
      setError(
        cause instanceof Error ? cause.message : 'Your files could not be loaded',
      )
    }
  }, [])

  useEffect(() => {
    void loadDesigns()
    return subscribeCanvasChanges(null, () => void loadDesigns())
  }, [loadDesigns])

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = designs ?? []
    if (!needle) return all
    return all.filter((design) => design.name.toLowerCase().includes(needle))
  }, [designs, query])

  const newFile = async () => {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const created = await createDesign()
      await navigate({ to: '/design/$id', params: { id: created.id } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be created')
      setCreating(false)
    }
  }

  const renameDesign = async () => {
    const target = renameTarget
    const name = renameName.trim()
    if (!target || !name || renaming) return
    setRenaming(true)
    try {
      const renamed = await orpc.webCanvas.rename({
        designId: target.id,
        name,
      })
      setDesigns((current) =>
        (current ?? [])
          .map((design) =>
            design.id === target.id
              ? { ...design, name, revision: renamed.revision, updatedAt: Date.now() }
              : design,
          )
          .sort(byRecent),
      )
      setRenameTarget(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The file could not be renamed'
      setError(message)
      setRenameTarget(null)
    } finally {
      setRenaming(false)
    }
  }

  const archiveDesign = async () => {
    const target = archiveTarget
    if (!target || archiving) return
    setArchiving(true)
    try {
      await orpc.design.archive({ id: target.id })
      setDesigns((current) => (current ?? []).filter((design) => design.id !== target.id))
      setArchiveTarget(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be archived')
      setArchiveTarget(null)
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      <main className="app-page-enter flex min-h-full min-w-0 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between px-8">
          <h1 className="cx-label cx-bracket">{title}</h1>
          <div className="flex items-center gap-8">
            <p className="cx-label tabular-nums">
              {designs ? `${visible.length} ${visible.length === 1 ? 'file' : 'files'}` : '···'}
            </p>
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-8 pb-6 pt-8">
          <label className="group/search flex h-10 min-w-0 flex-1 items-center gap-2.5 border-b border-line transition-colors duration-150 focus-within:border-cx-accent">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within/search:text-cx-accent" />
            <input
              type="search"
              aria-label="Search files"
              placeholder="Search files"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-cuelume-type=""
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </label>
          <div role="group" aria-label="Layout" className="flex items-center gap-2">
            {(
              [
                { id: 'grid', label: 'Grid view', Icon: LayoutGridIcon },
                { id: 'list', label: 'List view', Icon: ListIcon },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                title={label}
                data-cuelume-select=""
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'cx-press flex size-9 items-center justify-center rounded-full outline-none transition-[color,box-shadow] duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-ring',
                  view === id
                    ? 'text-foreground shadow-lift-selected'
                    : 'text-muted-foreground shadow-hairline hover:text-foreground hover:shadow-lift-hover',
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <button
              type="button"
              aria-label="New file"
              title="New file"
              onClick={() => void newFile()}
              disabled={creating}
              data-cuelume-tap=""
              className="cx-press flex size-9 items-center justify-center rounded-full bg-cx-accent text-white outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {creating ? <Spinner className="size-4" /> : <PlusIcon className="size-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-auto mb-4 flex w-full max-w-5xl items-center gap-2 rounded-xl bg-destructive/8 shadow-hairline px-3 py-2 text-xs text-destructive-foreground">
            <span className="min-w-0 flex-1">{error}</span>
            <Button size="xs" variant="outline" onClick={() => void loadDesigns()}>
              Try again
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setError(null)}>
              <XIcon />
            </Button>
          </div>
        ) : null}

        <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 px-8 pb-16">
          {designs === null ? (
            <FilesLoading view={view} />
          ) : visible.length === 0 ? (
            <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center rounded-xl bg-surface px-6 py-12 text-center shadow-panel">
              <EmptyCanvasPlate />
              <p className="cx-label cx-bracket">
                {designs.length === 0 ? 'No design files yet' : 'No files match that search'}
              </p>
              <p className="mt-1.5 max-w-xs text-pretty text-xs text-muted-foreground">
                {designs.length === 0
                  ? 'Start a file and open it on the canvas.'
                  : 'Try a different name.'}
              </p>
              {designs.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void newFile()}
                  disabled={creating}
                  className="cx-press mt-5 inline-flex items-center gap-1.5 rounded-full bg-cx-accent px-4 py-2 text-xs text-white outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
                  data-cuelume-tap=""
                >
                  {creating ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5 stroke-[2.5]" />}
                  <span>New file</span>
                </button>
              ) : null}
            </div>
          ) : view === 'grid' ? (
            <div className={GRID_CLASSES}>
              {visible.map((design) => (
                <FileCard
                  key={design.id}
                  design={design}
                  onRename={() => {
                    setRenameName(design.name)
                    setRenameTarget(design)
                  }}
                  onArchive={() => setArchiveTarget(design)}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-surface shadow-panel">
              {visible.map((design) => (
                <FileRow
                  key={design.id}
                  design={design}
                  onRename={() => {
                    setRenameName(design.name)
                    setRenameTarget(design)
                  }}
                  onArchive={() => setArchiveTarget(design)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              The structured document and its generated output use this name.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              autoFocus
              value={renameName}
              aria-label="File name"
              onChange={(event) => setRenameName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && renameName.trim()) void renameDesign()
              }}
            />
          </DialogPanel>
          <DialogFooter>
            <Button disabled={!renameName.trim() || renaming} onClick={() => void renameDesign()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{archiveTarget?.name}”?</DialogTitle>
            <DialogDescription>
              This removes the file from Recents. Its data stays in the archive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={archiving} onClick={() => void archiveDesign()}>
              {archiving ? <Spinner /> : <Trash2Icon />}
              Delete
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}
