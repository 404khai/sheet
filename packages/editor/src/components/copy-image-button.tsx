import { useEffect, useState } from 'react'
import { CopyIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'

type State = 'idle' | 'working' | 'done'

/**
 * Next to Export: copies what is selected on the canvas as an image. It waits
 * for a selection, says so when there is none, and confirms with a check that
 * draws itself, so a click that landed is never in doubt.
 */
export function CopyImageButton({
  enabled,
  onCopy,
  onError,
}: {
  enabled: boolean
  onCopy: () => Promise<void>
  onError: (message: string) => void
}) {
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    if (state !== 'done') return
    const timer = window.setTimeout(() => setState('idle'), 1_600)
    return () => window.clearTimeout(timer)
  }, [state])

  return (
    <button
      type="button"
      aria-label="Copy selection as image"
      title={enabled ? 'Copy selection as image' : 'Select something on the canvas to copy it as an image'}
      disabled={!enabled || state === 'working'}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md bg-surface text-foreground shadow-raised outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-smooth hover:bg-surface/80 hover:shadow-raised-hover focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.92] disabled:opacity-40 disabled:shadow-none',
      )}
      onClick={() => {
        setState('working')
        onCopy().then(
          () => setState('done'),
          (cause: unknown) => {
            setState('idle')
            onError(
              cause instanceof Error
                ? `Copy failed: ${cause.message}. Nothing was changed; try again.`
                : 'Copy failed. Nothing was changed; try again.',
            )
          },
        )
      }}
    >
      {state === 'done' ? (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 text-cx-accent" fill="none">
          <path
            className="cx-draw"
            pathLength="1"
            d="M3 8.5l3.2 3.2L13 4.8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      ) : (
        <CopyIcon className="size-3.5 text-muted-foreground" />
      )}
      <span className="sr-only">{state === 'done' ? 'Copied' : state === 'working' ? 'Copying…' : 'Copy'}</span>
    </button>
  )
}
