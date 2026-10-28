import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { orpc } from '@sheet/rpc/client'
import { subscribeCanvasChanges } from './canvas-events'

export interface OpenTab {
  id: string
  name: string
}

const STORAGE_KEY = 'sheet:open-tabs'
const EVENT_KEY = 'sheet:open-tabs-changed'
const LAST_FILE_KEY = 'sheet:last-file'

export function getStoredTabs(): OpenTab[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is OpenTab =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.name === 'string',
      )
    }
  } catch {
    // ignore parse error
  }
  return []
}

export function saveStoredTabs(tabs: OpenTab[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    window.dispatchEvent(new Event(EVENT_KEY))
  } catch {
    // ignore write error
  }
}

export function useOpenTabs(activeDocument?: { id: string; name: string }) {
  const [tabs, setTabs] = useState<OpenTab[]>(() => {
    const stored = getStoredTabs()
    if (activeDocument?.id && !stored.some((item) => item.id === activeDocument.id)) {
      const next = [...stored, { id: activeDocument.id, name: activeDocument.name || 'Untitled' }]
      saveStoredTabs(next)
      return next
    }
    return stored
  })

  let navigate: ReturnType<typeof useNavigate> | undefined
  try {
    navigate = useNavigate()
  } catch {
    navigate = undefined
  }

  let pathname = ''
  try {
    pathname = typeof useLocation === 'function' ? (useLocation()?.pathname ?? '') : ''
  } catch {
    pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  }

  // Sync tabs from storage
  useEffect(() => {
    const update = () => setTabs(getStoredTabs())
    window.addEventListener(EVENT_KEY, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT_KEY, update)
      window.removeEventListener('storage', update)
    }
  }, [])

  // Keep every tab's title live: any design event (an MCP rename included)
  // refreshes names from the source of truth, and drops tabs whose design
  // was archived or deleted.
  useEffect(() => {
    let active = true
    let timer: number | undefined
    const run = () => {
      void orpc.design.list().then((designs) => {
        if (!active) return
        const names = new Map(designs.map((item) => [item.id, item.name]))
        const current = getStoredTabs()
        const next = current.map((tab) => {
          const name = names.get(tab.id)
          return name && name !== tab.name ? { ...tab, name } : tab
        })
        if (next.some((tab, index) => tab !== current[index])) saveStoredTabs(next)
      }).catch(() => undefined)
    }
    // Every edit announces itself; names only change on rename, so batch the
    // announcements instead of listing every design once per transaction.
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(run, 1_500)
    }
    const stop = subscribeCanvasChanges(null, refresh, { onReady: run })
    return () => {
      active = false
      window.clearTimeout(timer)
      stop()
    }
  }, [])

  // When activeDocument changes, ensure it's in the open tabs
  useEffect(() => {
    if (!activeDocument?.id) return
    const current = getStoredTabs()
    const index = current.findIndex((item) => item.id === activeDocument.id)
    if (index >= 0) {
      if (current[index]!.name !== activeDocument.name && activeDocument.name) {
        current[index]!.name = activeDocument.name
        saveStoredTabs([...current])
      }
    } else {
      saveStoredTabs([...current, { id: activeDocument.id, name: activeDocument.name || 'Untitled' }])
    }
  }, [activeDocument?.id, activeDocument?.name])

  const closeTab = (id: string) => {
    const current = getStoredTabs()
    const remaining = current.filter((item) => item.id !== id)
    saveStoredTabs(remaining)
    setTabs(remaining)

    // If closing active tab, navigate to next available or /app
    if (pathname.includes(id)) {
      if (remaining.length > 0) {
        const next = remaining.at(-1)!
        if (navigate) {
          void navigate({ to: '/design/$id', params: { id: next.id } })
        } else if (typeof window !== 'undefined') {
          window.location.assign(`/design/${next.id}`)
        }
      } else {
        if (navigate) {
          void navigate({ to: '/app' })
        } else if (typeof window !== 'undefined') {
          window.location.assign('/app')
        }
      }
    }
  }

  return {
    tabs,
    closeTab,
  }
}

/**
 * Puts an open document in the tab list and keeps its name current, without
 * the event stream and design listing `useOpenTabs` carries. The editor uses
 * this; only the tab bar needs the full hook.
 */
export function useRegisterOpenTab(activeDocument?: { id: string; name: string }) {
  const id = activeDocument?.id
  const name = activeDocument?.name
  useEffect(() => {
    if (!id) return
    const current = getStoredTabs()
    const index = current.findIndex((item) => item.id === id)
    if (index < 0) {
      saveStoredTabs([...current, { id, name: name || 'Untitled' }])
    } else if (name && current[index]?.name !== name) {
      saveStoredTabs(current.map((tab) => (tab.id === id ? { ...tab, name } : tab)))
    }
    try {
      localStorage.setItem(LAST_FILE_KEY, id)
    } catch {
      // Without storage the app simply opens on Home next time.
    }
  }, [id, name])
}

/** The file opened most recently, if it is still among the open tabs. */
export function getLastOpenFile(): string | null {
  try {
    const id = localStorage.getItem(LAST_FILE_KEY)
    return id && getStoredTabs().some((tab) => tab.id === id) ? id : null
  } catch {
    return null
  }
}
