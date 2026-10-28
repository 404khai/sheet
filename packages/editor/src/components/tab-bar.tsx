import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { File01Icon, HomeIcon, PlusIcon, XIcon } from '@sheet/ui/icons'
import { Spinner } from '@sheet/ui/spinner'
import { toastManager } from '@sheet/ui/toast'
import { cn } from '@sheet/ui/utils'
import { createDesign } from '../lib/designs'
import { useOpenTabs } from '../lib/open-tabs'

/**
 * A tab on the window bar. The open one is a raised key, the same lift every
 * chosen thing gets; the rest sit flat and take a faint plate on hover.
 */
const tabClassName = (active: boolean) =>
  cn(
    'relative my-auto flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs outline-none transition-[background-color,color,scale] duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]',
    active
      ? 'bg-foreground/[0.07] text-foreground'
      : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
  )

function TabLink({
  to,
  params,
  className,
  children,
  'aria-label': ariaLabel,
  'aria-current': ariaCurrent,
  title,
  hasRouter,
  onAuxClick,
}: {
  to: string
  params?: Record<string, string>
  className?: string
  children: ReactNode
  'aria-label'?: string
  'aria-current'?: 'page'
  title?: string
  hasRouter: boolean
  onAuxClick?: (event: React.MouseEvent) => void
}) {
  if (hasRouter) {
    return (
      <Link
        data-cuelume-navigate=""
        to={to as any}
        params={params as any}
        className={className}
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
        title={title}
        onAuxClick={onAuxClick}
      >
        {children}
      </Link>
    )
  }
  let href = to
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      href = href.replace(`$${key}`, value)
    }
  }
  return (
    <a
      href={href}
      data-cuelume-navigate=""
      className={className}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      title={title}
      onAuxClick={onAuxClick}
    >
      {children}
    </a>
  )
}

/**
 * The window's tabs: Home, every open file, and `+` for a new one. `+` makes
 * the file at once instead of asking where to start, so a blank canvas is one
 * click away from anywhere. When the files outgrow the bar it scrolls sideways
 * (wheel or trackpad) and fades at the end rather than squeezing names away.
 */
export function DocumentTabBar({
  activeDocument,
}: {
  activeDocument?: { id: string; name: string }
}) {
  let pathname = ''
  let hasRouter = false
  try {
    pathname = typeof useLocation === 'function' ? (useLocation()?.pathname ?? '') : ''
    hasRouter = true
  } catch {
    pathname = typeof window !== 'undefined' ? window.location.pathname : ''
    hasRouter = false
  }
  let navigate: ReturnType<typeof useNavigate> | null = null
  try {
    navigate = useNavigate()
  } catch {
    navigate = null
  }
  const { tabs, closeTab } = useOpenTabs(activeDocument)
  const activeId = activeDocument?.id ?? pathname.match(/^\/design\/([^/]+)/)?.[1]
  const isHome = pathname.startsWith('/app')
  const [creating, setCreating] = useState(false)
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Keep the open file's tab in view when it changes, the way a browser does.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !activeId) return
    strip.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  const newFile = async () => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createDesign()
      if (navigate) await navigate({ to: '/design/$id', params: { id: created.id } })
      else window.location.assign(`/design/${created.id}`)
    } catch (cause) {
      toastManager.add({
        type: 'error',
        title: 'The new file was not created',
        description: `${cause instanceof Error ? cause.message : 'The local server did not answer.'} Your open files are untouched; try again.`,
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div data-tauri-drag-region className="flex h-full min-w-0 items-stretch gap-1">
      <TabLink
        to="/app"
        hasRouter={hasRouter}
        className={cn(tabClassName(isHome), 'w-8 justify-center px-0')}
        aria-label="Home"
        aria-current={isHome ? 'page' : undefined}
        title="Home"
      >
        <HomeIcon className="size-3.5" />
      </TabLink>

      <div
        ref={stripRef}
        data-tauri-drag-region
        className="flex min-w-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden pe-3 [mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          // A mouse wheel scrolls vertically; on this strip it means sideways.
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeId === tab.id
          return (
            <div key={tab.id} data-tab-id={tab.id} className="group/tab relative flex h-full shrink-0 items-center">
              <TabLink
                to="/design/$id"
                params={{ id: tab.id }}
                hasRouter={hasRouter}
                aria-current={isActive ? 'page' : undefined}
                title={tab.name}
                className={cn(tabClassName(isActive), 'pe-8')}
                onAuxClick={(event) => {
                  // Middle-click closes, as in every tabbed app on every OS.
                  if (event.button !== 1) return
                  event.preventDefault()
                  closeTab(tab.id)
                }}
              >
                <File01Icon className={cn('size-3.5 shrink-0', isActive ? 'text-cx-accent' : 'opacity-70')} />
                <span className="max-w-40 truncate">{tab.name}</span>
              </TabLink>
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                title="Close tab"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                className={cn(
                  'absolute end-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-[opacity,color,background-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'opacity-100' : 'pointer-fine:opacity-0 pointer-fine:group-hover/tab:opacity-100',
                )}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        aria-label="New file"
        title="New file"
        disabled={creating}
        data-cuelume-tap=""
        onClick={() => void newFile()}
        className={cn(tabClassName(false), 'w-7 justify-center px-0 disabled:opacity-60')}
      >
        {creating ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5" />}
      </button>
    </div>
  )
}
