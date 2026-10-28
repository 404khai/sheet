import { useState } from 'react'
import { ChevronDownIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { FRAME_PRESET_GROUPS, type FramePreset } from '@sheet/canvas/web-frames'

const GLYPH_BOX = 14

/**
 * The frame's own proportions, drawn to scale. A phone is a tall slot and a
 * social header a thin strip, so the list can be scanned by shape before the
 * numbers are read. It lights up with its row.
 */
function AspectGlyph({ width, height }: { width: number; height: number }) {
  const scale = (GLYPH_BOX - 2) / Math.max(width, height)
  const w = Math.max(3, width * scale)
  const h = Math.max(3, height * scale)
  return (
    <svg viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} aria-hidden="true" className="size-3.5 shrink-0">
      <rect
        x={(GLYPH_BOX - w) / 2}
        y={(GLYPH_BOX - h) / 2}
        width={w}
        height={h}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

/**
 * What the right panel shows while the Frame tool is active: the sizes a frame
 * can start from. Choosing one places a frame of that size on the canvas.
 */
export function FramePresetsPanel({ onPick }: { onPick: (preset: FramePreset) => void }) {
  // Every group starts folded, so the list opens as seven short headings.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())

  return (
    <div className="pb-6">
      <p className="px-4 pb-1 pt-3 text-xs text-muted-foreground">
        Pick a size, or drag on the canvas to draw your own.
      </p>
      {FRAME_PRESET_GROUPS.map((group) => {
        const open = opened.has(group.id)
        return (
          <section key={group.id}>
            <button
              type="button"
              aria-expanded={open}
              className="flex h-9 w-full items-center gap-2 px-4 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() =>
                setOpened((current) => {
                  const next = new Set(current)
                  if (next.has(group.id)) next.delete(group.id)
                  else next.add(group.id)
                  return next
                })
              }
            >
              <ChevronDownIcon
                className={cn('size-3 transition-transform duration-200 ease-smooth', !open && '-rotate-90')}
              />
              <span className="text-xs font-semibold text-foreground">{group.label}</span>
            </button>
            {open
              ? group.presets.map((preset) => (
                  <button
                    key={`${group.id}-${preset.name}`}
                    type="button"
                    className="group mx-2 my-0.5 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xs text-foreground/85 outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-accent hover:text-foreground active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => onPick(preset)}
                  >
                    <span className="text-muted-foreground transition-colors group-hover:text-cx-accent">
                      <AspectGlyph width={preset.width} height={preset.height} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-start font-medium">{preset.name}</span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {preset.width} × {preset.height}
                    </span>
                  </button>
                ))
              : null}
          </section>
        )
      })}
    </div>
  )
}
