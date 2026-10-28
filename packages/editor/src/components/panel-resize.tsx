import { useCallback, useRef, useState } from 'react'
import { cn } from '@sheet/ui/utils'

export const PANEL_MIN = 208
export const PANEL_MAX = 360

const clamp = (value: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, value)))

function readWidth(key: string, fallback: number) {
  try {
    const stored = Number(globalThis.localStorage?.getItem(key))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : fallback
  } catch {
    return fallback
  }
}

/** A side panel's width in px, clamped and remembered per panel across sessions. */
export function usePanelWidth(key: string, fallback: number) {
  const [width, setWidth] = useState(() => readWidth(key, fallback))
  const set = useCallback(
    (next: number) => {
      const value = clamp(next)
      setWidth(value)
      try {
        globalThis.localStorage?.setItem(key, String(value))
      } catch {
        // The width still holds for this session.
      }
    },
    [key],
  )
  return [width, set] as const
}

/**
 * The grab strip on a panel's inner edge. Drag to resize; double-click puts
 * it back to its default. It is wider than it looks (8px) and shows an accent
 * hairline while hovered or held, so it can be found without hunting.
 */
export function PanelResizer({
  side,
  width,
  fallback,
  onResize,
  label,
}: {
  /** Which edge of the window the panel is docked to. */
  side: 'left' | 'right'
  width: number
  fallback: number
  onResize: (next: number) => void
  label: string
}) {
  const start = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      className={cn(
        'group/resize absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none',
        side === 'left' ? '-end-1' : '-start-1',
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { x: event.clientX, width }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        const delta = event.clientX - start.current.x
        onResize(start.current.width + (side === 'left' ? delta : -delta))
      }}
      onPointerUp={() => {
        start.current = null
        setDragging(false)
      }}
      onPointerCancel={() => {
        start.current = null
        setDragging(false)
      }}
      onDoubleClick={() => onResize(fallback)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
        const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
        if (event.key === grow) onResize(width + step)
        else if (event.key === shrink) onResize(width - step)
        else return
        event.preventDefault()
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cx-accent opacity-0 transition-opacity duration-150 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100',
          dragging && 'opacity-100',
        )}
      />
    </div>
  )
}
