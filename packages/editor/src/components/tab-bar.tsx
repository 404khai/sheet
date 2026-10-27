import { Link, useLocation } from '@tanstack/react-router'
import { PlusIcon, XIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { useOpenTabs } from '../lib/open-tabs'

import { type ReactNode } from 'react'

/**
 * A tab sits on the bar with tactile elevation and optical refinement.
 * The active tab is lifted on an elevated plate with a subtle border and glowing accent pip,
 * while inactive tabs gently lift on hover.
 */
const tabClassName = (active: boolean) =>
  cn(
    'relative my-auto flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs outline-none transition-all duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]',
    active
      ? 'bg-surface text-foreground shadow-xs border border-edge/80 font-medium'
      : 'text-muted-foreground hover:bg-surface/50 hover:text-foreground',
  )

/** The glowing accent pip beside the open tab's name. */
function ActiveMark({ active }: { active: boolean }) {
  return active ? (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full bg-cx-accent shadow-[0_0_6px_var(--cx-accent)]"
    />
  ) : null
}

function TabLink({
  to,
  params,
  className,
  children,
  'aria-label': ariaLabel,
  title,
  hasRouter,
}: {
  to: string
  params?: Record<string, string>
  className?: string
  children: ReactNode
  'aria-label'?: string
  title?: string
  hasRouter: boolean
}) {
  if (hasRouter) {
    return (
      <Link
        data-cuelume-navigate=""
        to={to as any}
        params={params as any}
        className={className}
        aria-label={ariaLabel}
        title={title}
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
    <a href={href} data-cuelume-navigate="" className={className} aria-label={ariaLabel} title={title}>
      {children}
    </a>
  )
}

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
  const { tabs, closeTab } = useOpenTabs(activeDocument)
  const activeId = activeDocument?.id ?? pathname.match(/^\/design\/([^/]+)/)?.[1]

  const isDashboard =
    pathname === '/app' ||
    pathname === '/app/' ||
    (pathname.startsWith('/app') && !pathname.startsWith('/app/new'))
  const isLauncher = pathname.startsWith('/app/new')

  return (
    <div data-tauri-drag-region className="flex h-full min-w-0 items-stretch gap-0.5">
      <TabLink
        to="/app"
        hasRouter={hasRouter}
        className={tabClassName(isDashboard)}
        aria-label="Back to dashboard"
      >
        <ActiveMark active={isDashboard} />
        <span>Dashboard</span>
      </TabLink>

      <div className="flex min-w-0 items-stretch gap-0.5">
        {tabs.map((tab) => {
          const isActive = activeId === tab.id
          return (
            <div
              key={tab.id}
              className={cn(
                'group/tab relative flex h-full min-w-0 items-center',
                isActive && 'shrink-0',
              )}
            >
              <TabLink
                to="/design/$id"
                params={{ id: tab.id }}
                hasRouter={hasRouter}
                className={cn(tabClassName(isActive), 'min-w-0 pe-7')}
              >
                <ActiveMark active={isActive} />
                <span className="max-w-44 truncate max-md:max-w-24">{tab.name}</span>
              </TabLink>
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                title="Close tab"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className={cn(
                  'cx-press absolute end-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none transition-[opacity,color,background-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                )}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )
        })}
      </div>

      <TabLink
        to="/app/new"
        hasRouter={hasRouter}
        className={cn(tabClassName(isLauncher), 'px-2')}
        aria-label="New tab"
        title="New tab"
      >
        <PlusIcon className="size-3.5" />
      </TabLink>
    </div>
  )
}
