import { useEffect, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import type { WebDocument } from '@sheet/canvas/web-model'

/**
 * One cache of rendered-document previews for every place that shows a file
 * small: home cards, list rows, tabs. Keyed by design and revision, so an edit
 * shows up the next time the file is drawn and an unchanged file is never
 * fetched twice. `null` means the design has no web document to show.
 */
const cache = new Map<string, WebDocument | null>()

export type DesignPreview =
  | { status: 'loading' }
  | { status: 'ready'; document: WebDocument }
  | { status: 'empty' }

function fromCache(key: string): DesignPreview {
  if (!cache.has(key)) return { status: 'loading' }
  const document = cache.get(key)
  return document ? { status: 'ready', document } : { status: 'empty' }
}

/** The preview of `designId` at `revision`; pass no revision to take whatever was last fetched. */
export function useDesignPreview(designId: string, revision?: number): DesignPreview {
  const key = `${designId}:${revision ?? 'latest'}`
  const [preview, setPreview] = useState<DesignPreview>(() => fromCache(key))

  useEffect(() => {
    setPreview(fromCache(key))
    if (cache.has(key)) return
    if (typeof orpc.webCanvas?.get !== 'function') return
    let active = true
    void orpc.webCanvas
      .get({ designId })
      .then((result) => {
        const document = result.status === 'ready' ? result.document : null
        cache.set(key, document)
        if (active) setPreview(fromCache(key))
      })
      .catch(() => {
        // A preview is decoration: a failed fetch shows the empty state and the
        // file still opens. It is retried the next time this key mounts.
        if (active) setPreview({ status: 'empty' })
      })
    return () => {
      active = false
    }
  }, [designId, key])

  return preview
}
