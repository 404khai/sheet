import { useEffect, useState } from 'react'
import {
  SHADERS,
  SHADER_NAMES,
  shaderThumbnail,
  type ShaderGroup as ShaderGroupKind,
  type ShaderName,
} from '@sheet/canvas/web-shaders'
import { Dialog, DialogHeader, DialogPopup, DialogTitle } from '@sheet/ui/dialog'

type ShaderGroupId = ShaderGroupKind
type ShaderGroup = { id: ShaderGroupId; label: string; names: readonly ShaderName[] }

/** The gallery's sections, in order, each holding the shaders that declare that group. */
const GROUP_LABELS: ReadonlyArray<{ id: ShaderGroupId; label: string }> = [
  { id: 'gradient', label: 'Gradients' },
  { id: 'pattern', label: 'Patterns and noise' },
  { id: 'effect', label: 'Effects' },
]

function groups(): ShaderGroup[] {
  return GROUP_LABELS.map(({ id, label }) => ({
    id,
    label,
    names: SHADER_NAMES.filter((name) => SHADERS[name].group === id),
  })).filter((group) => group.names.length > 0)
}

/**
 * A still picture of the shader. It is drawn once, off to the side, and kept,
 * so the card is an image: opening the gallery costs nothing, and nothing in
 * it is running while you look. Until the picture is ready the card holds its
 * place; if the shader cannot be drawn here the card says so.
 */
function ShaderThumb({ name }: { name: ShaderName }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed' }>({
    status: 'loading',
  })
  useEffect(() => {
    let current = true
    void shaderThumbnail(name).then((url) => {
      if (current) setState(url ? { status: 'ready', url } : { status: 'failed' })
    })
    return () => {
      current = false
    }
  }, [name])
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary shadow-hairline">
      {state.status === 'ready' ? (
        <img src={state.url} alt="" draggable={false} className="size-full object-cover" />
      ) : state.status === 'failed' ? (
        <span className="cx-label absolute inset-0 grid place-items-center">No preview</span>
      ) : (
        <span aria-hidden="true" className="cx-shimmer absolute inset-0 opacity-30" />
      )}
    </div>
  )
}

/**
 * The shader gallery. It opens from the Shaders tool and shows a picture of
 * every shader; choosing one sets it on the page as a live box that can be
 * moved and resized like any frame.
 */
export function ShaderGallery({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (name: ShaderName) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Shaders</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {groups().map((group) => (
            <section key={group.id} className="border-t border-line px-4 py-4 first:border-t-0">
              <h3 className="mb-3 text-xs font-semibold text-foreground">{group.label}</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {group.names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Insert ${SHADERS[name].label} shader`}
                    title={SHADERS[name].description}
                    className="cx-press group flex min-w-0 flex-col gap-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onPick(name)
                      onOpenChange(false)
                    }}
                  >
                    <span className="block transition-shadow duration-150 group-hover:shadow-lift-selected">
                      <ShaderThumb name={name} />
                    </span>
                    <span className="truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                      {SHADERS[name].label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogPopup>
    </Dialog>
  )
}
