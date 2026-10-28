import { useEffect, useRef, useState } from 'react'
import { Button } from '@sheet/ui/button'
import {
  BUILTIN_META,
  DEFAULT_SHORTCUTS,
  SHORTCUT_GROUPS,
  chordsOf,
  detectConflicts,
  eventToChord,
  formatChord,
  resolveBuiltIn,
  type BuiltInShortcutId,
  type ShortcutConfig,
} from '@sheet/editor/lib/shortcuts'
import { cn } from '@sheet/ui/utils'

/** Per-row actions wait for the row's hover with a mouse; touch and keyboard always see them. */
const ROW_ACTION =
  'text-muted-foreground transition-[opacity,background-color,color] pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 focus-visible:opacity-100'

export function ShortcutsSettings({
  config,
  onChange,
}: {
  config: ShortcutConfig
  onChange: (next: ShortcutConfig) => void
}) {
  const [draft, setDraft] = useState(config)
  const [recording, setRecording] = useState<
    { kind: 'builtIn'; id: BuiltInShortcutId } | null
  >(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(config)
  }, [config])

  const scheduleSave = (next: ShortcutConfig) => {
    // Don't persist conflicting maps — runtime would be ambiguous and RPC rejects them.
    if (detectConflicts(next).length > 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onChange(next), 300)
  }

  const commit = (next: ShortcutConfig) => {
    setDraft(next)
    scheduleSave(next)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const target = recording
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const chord = eventToChord(e)
      if (!chord) return

      setDraft((current) => {
        const next = {
          ...current,
          overrides: { ...current.overrides, [target.id]: chord },
        }
        if (detectConflicts(next).length === 0) {
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => onChange(next), 300)
        }
        return next
      })
      setRecording(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange])

  const conflicts = detectConflicts(draft)

  const resetBuiltIn = (id: BuiltInShortcutId) => {
    const overrides = { ...draft.overrides }
    delete overrides[id]
    commit({ ...draft, overrides })
  }

  const unbindBuiltIn = (id: BuiltInShortcutId) => {
    commit({
      ...draft,
      overrides: { ...draft.overrides, [id]: null },
    })
  }

  const resetAll = () => {
    commit({ overrides: {}, custom: [] })
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-pretty text-muted-foreground">
          Click a key to record a new one. Esc cancels. Holding Space for the hand tool stays fixed.
        </p>
        <Button type="button" variant="outline" onClick={resetAll} className="shrink-0">
          Reset all
        </Button>
      </div>

      {conflicts.length > 0 && (
        <div
          role="alert"
          className="app-page-enter rounded-xl bg-destructive/8 px-3.5 py-2.5 text-xs text-destructive-foreground shadow-hairline"
        >
          {conflicts.map((conflict) => (
            <p key={conflict.serialized}>
              {conflict.label} is used by {conflict.owners.join(' and ')}.
            </p>
          ))}
        </div>
      )}

      {SHORTCUT_GROUPS.map((group) => {
        const ids = (
          Object.keys(BUILTIN_META) as BuiltInShortcutId[]
        ).filter((id) => BUILTIN_META[id].group === group.id)
        return (
          <section
            key={group.id}
            className="flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-lift"
          >
            <h3 className="px-2.5 pb-0.5 pt-2 text-[13px] font-semibold tracking-tight text-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col">
              {ids.map((id) => {
                const chords = resolveBuiltIn(id, draft)
                const isDefault =
                  !Object.prototype.hasOwnProperty.call(draft.overrides, id)
                const isRecording =
                  recording?.kind === 'builtIn' && recording.id === id
                return (
                  <li
                    key={id}
                    className="group/row flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {BUILTIN_META[id].label}
                    </span>
                    {!isDefault && !isRecording ? (
                      <span className="me-1 size-1.5 shrink-0 rounded-full bg-cx-accent" title="Changed from the default" />
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${BUILTIN_META[id].label}: ${isRecording ? 'recording, press keys' : formatChord(chords)}`}
                      className={cn(
                        'min-w-12 rounded-md px-2 py-1 text-[11px] tabular-nums outline-none transition-[background-color,box-shadow,color,scale] duration-150 ease-smooth active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-ring',
                        isRecording
                          ? 'animate-pulse bg-cx-accent/10 text-cx-accent shadow-[0_0_0_1.5px_var(--cx-accent)]'
                          : 'bg-surface text-foreground shadow-raised hover:shadow-raised-hover',
                      )}
                      onClick={() => setRecording({ kind: 'builtIn', id })}
                    >
                      {isRecording ? 'Press keys…' : formatChord(chords)}
                    </button>
                    {!isDefault && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className={ROW_ACTION}
                        onClick={() => resetBuiltIn(id)}
                      >
                        Default
                      </Button>
                    )}
                    {chords !== null && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className={ROW_ACTION}
                        onClick={() => unbindBuiltIn(id)}
                      >
                        Clear
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <p className="px-1 text-xs text-muted-foreground">
        Defaults include {Object.keys(DEFAULT_SHORTCUTS).length} actions
        {chordsOf(DEFAULT_SHORTCUTS['tool.select']).length
          ? ` (e.g. Select is ${formatChord(DEFAULT_SHORTCUTS['tool.select'])})`
          : ''}
        .
      </p>
    </div>
  )
}
