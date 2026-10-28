import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CheckIcon, MessageSquareIcon, Trash2Icon, XIcon } from '@sheet/ui/icons'
import { Button } from '@sheet/ui/button'
import { cn } from '@sheet/ui/utils'
import { relativeTime } from '../lib/designs'
import type { DesignComment } from '../lib/use-comments'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const THREAD_WIDTH = 304
const THREAD_MAX_HEIGHT = 380

/** The numbered dot on a commented element. */
export function CommentPin({
  count,
  active,
  rect,
  onOpen,
}: {
  count: number
  active: boolean
  rect: Rect
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${count} open ${count === 1 ? 'comment' : 'comments'} on this element`}
      data-cuelume-open=""
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'absolute z-30 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full rounded-bl-sm text-[11px] font-medium tabular-nums text-white outline-none transition-[transform,box-shadow] duration-150 ease-smooth hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
        'bg-cx-accent shadow-hairline',
        active && 'scale-110 ring-2 ring-white/70',
      )}
      style={{ left: rect.left + rect.width, top: rect.top }}
    >
      {count}
    </button>
  )
}

function CommentRow({
  comment,
  onResolve,
  onDelete,
}: {
  comment: DesignComment
  onResolve: (resolved: boolean) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch {
      // The row stays as it was; the list refreshes on its own timer.
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={cn('group/comment flex flex-col gap-1 px-3 py-2.5', comment.resolved && 'opacity-55')}>
      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
        <span
          className={cn(
            'rounded-full px-1.5 py-px font-medium',
            comment.author === 'agent' ? 'bg-cx-accent/15 text-cx-accent' : 'bg-accent text-foreground',
          )}
        >
          {comment.author === 'agent' ? 'Agent' : 'You'}
        </span>
        <span>{relativeTime(comment.createdAt)}</span>
        {comment.resolved ? <span>· resolved</span> : null}
        <span className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
          <button
            type="button"
            disabled={busy}
            aria-label={comment.resolved ? 'Reopen comment' : 'Resolve comment'}
            title={comment.resolved ? 'Reopen' : 'Resolve'}
            data-cuelume-toggle=""
            onClick={() => void run(() => onResolve(!comment.resolved))}
            className="flex size-5 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
          >
            <CheckIcon className="size-3" />
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Delete comment"
            title="Delete"
            data-cuelume-close=""
            onClick={() => void run(onDelete)}
            className="flex size-5 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3" />
          </button>
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
        {comment.body}
      </p>
    </li>
  )
}

/**
 * The thread for one element: its comments, and a box to add another. Placed
 * beside the element, flipped to its other side when there is no room.
 */
export function CommentThread({
  rect,
  bounds,
  nodeLabel,
  comments,
  onClose,
  onSubmit,
  onResolve,
  onDelete,
}: {
  rect: Rect | null
  bounds: { width: number; height: number }
  nodeLabel: string
  comments: DesignComment[]
  onClose: () => void
  onSubmit: (body: string) => Promise<unknown>
  onResolve: (commentId: string, resolved: boolean) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(body)
      setDraft('')
    } catch (cause) {
      const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : ''
      setError(`The comment was not saved${reason}. Your text is still here, so you can try again.`)
    } finally {
      setSaving(false)
    }
  }

  const anchor = rect ?? { left: 24, top: 24, width: 0, height: 0 }
  const fitsRight = anchor.left + anchor.width + 14 + THREAD_WIDTH <= bounds.width
  const left = fitsRight
    ? anchor.left + anchor.width + 14
    : Math.max(8, anchor.left - THREAD_WIDTH - 14)
  const top = Math.min(Math.max(8, anchor.top), Math.max(8, bounds.height - THREAD_MAX_HEIGHT - 8))
  const style: CSSProperties = { left, top, width: THREAD_WIDTH, maxHeight: THREAD_MAX_HEIGHT }

  return (
    <div
      role="dialog"
      aria-label={`Comments on ${nodeLabel}`}
      className="app-page-enter absolute z-40 flex flex-col overflow-hidden rounded-2xl bg-surface text-foreground shadow-panel-lg"
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={nodeLabel}>
          {nodeLabel}
        </span>
        <button
          type="button"
          aria-label="Close comments"
          onClick={onClose}
          data-cuelume-close=""
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </header>

      {comments.length > 0 ? (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onResolve={(resolved) => onResolve(comment.id, resolved)}
              onDelete={() => onDelete(comment.id)}
            />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line p-2.5">
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          placeholder="Tell the designer or an agent what to change"
          aria-label="Comment"
          data-cuelume-type=""
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line. Skip while an input method is composing.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          className="max-h-32 min-h-14 w-full resize-none rounded-lg bg-transparent px-2.5 py-2 text-xs leading-relaxed text-foreground shadow-hairline outline-none transition-[box-shadow] duration-150 ease-smooth placeholder:text-muted-foreground/70 focus-visible:shadow-lift-selected"
        />
        {error ? (
          <p role="alert" className="text-2xs leading-relaxed text-destructive-foreground">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
          <Button size="sm" disabled={!draft.trim() || saving} loading={saving} onClick={() => void submit()}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Every comment on the design, grouped by element, for the left panel. */
export function CommentsList({
  comments,
  onSelectNode,
  onResolve,
  onDelete,
}: {
  comments: DesignComment[]
  onSelectNode: (nodeId: string) => void
  onResolve: (commentId: string, resolved: boolean) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<'open' | 'resolved'>('open')
  const shown = comments.filter((comment) => comment.resolved === (filter === 'resolved'))
  const groups = new Map<string, { label: string; items: DesignComment[] }>()
  for (const comment of shown) {
    const group = groups.get(comment.nodeId) ?? { label: comment.nodeLabel, items: [] }
    group.items.push(comment)
    groups.set(comment.nodeId, group)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-3 mb-2 grid shrink-0 grid-cols-2 border-b border-line">
        {(['open', 'resolved'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            data-cuelume-select=""
            onClick={() => setFilter(value)}
            className={cn(
              "relative py-2 text-xs capitalize outline-none transition-colors duration-150 ease-smooth after:absolute after:inset-x-3 after:-bottom-px after:h-px after:origin-center after:bg-cx-accent after:transition-transform after:duration-200 after:content-[''] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              filter === value
                ? 'text-foreground after:scale-x-100'
                : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {groups.size === 0 ? (
          <p className="px-5 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {filter === 'open'
              ? 'No open comments. Pick the comment tool, then click any element to leave one.'
              : 'Nothing resolved yet.'}
          </p>
        ) : (
          [...groups.entries()].map(([nodeId, group]) => (
            <section key={nodeId} className="mx-2 mb-2 overflow-hidden rounded-xl bg-background shadow-hairline">
              <button
                type="button"
                onClick={() => onSelectNode(nodeId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs font-medium transition-colors duration-150 hover:bg-accent"
                title="Select this element"
              >
                <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="text-2xs tabular-nums text-muted-foreground">{group.items.length}</span>
              </button>
              <ul className="divide-y divide-line border-t border-line">
                {group.items.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    onResolve={(resolved) => onResolve(comment.id, resolved)}
                    onDelete={() => onDelete(comment.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
