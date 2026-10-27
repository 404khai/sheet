import { Outlet, createRootRoute, useLocation } from '@tanstack/react-router'
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router'
import { useEffect } from 'react'
import { syncThemePreference } from '@sheet/shell/lib/theme'
import { syncAccent } from '@sheet/shell/lib/accent'
import { syncUiScale } from '@sheet/shell/lib/ui-scale'
import { syncUiFont } from '@sheet/shell/lib/ui-font'
import { initSound } from '@sheet/ui/sound'
import { ToastProvider } from '@sheet/ui/toast'
import { startAutoUpdate } from '@sheet/shell/lib/updates'
import { AppShell } from '@sheet/shell/app-page-shell'
import { Onboarding } from '@sheet/shell/onboarding'
import { useCaptureResponder } from '@sheet/editor/lib/capture-client'

export const Route = createRootRoute({ component: RootLayout })

/**
 * The window's own chrome, which is none of it: the platform draws the title
 * bar, and everything below it is the shared interface.
 * Theme and interface scale are restored before first paint by the two scripts
 * the build injects, and kept in step here for as long as the window lives.
 * The static boot splash in `index.html` comes off once React has mounted —
 * the route content paints in the same commit, so there is no blank frame.
 */
function RootLayout() {
  const { pathname } = useLocation()
  // Settings is a window of its own. It keeps the look in step with the app, but
  // it takes no part in the app's event streams: a second capture responder
  // would answer every screenshot request twice.
  if (pathname.startsWith('/settings')) return <SettingsRoot />
  return <AppRoot pathname={pathname} />
}

/** Everything the Settings window needs to look and sound like the app, and no more. */
function SettingsRoot() {
  useEffect(() => syncThemePreference(), [])
  useEffect(() => syncAccent(), [])
  useEffect(() => syncUiScale(), [])
  useEffect(() => syncUiFont(), [])
  useEffect(() => initSound(), [])
  useEffect(() => {
    document.getElementById('boot-splash')?.remove()
  }, [])

  return (
    <NuqsAdapter>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </NuqsAdapter>
  )
}

function AppRoot({ pathname }: { pathname: string }) {
  // One shell for the whole app, so moving between files and the dashboard keeps
  // the sidebar, tabs, and event streams alive instead of rebuilding them.
  const framed = pathname.startsWith('/app') || pathname.startsWith('/design')
  useEffect(() => syncThemePreference(), [])
  useEffect(() => syncAccent(), [])
  useEffect(() => syncUiScale(), [])
  useEffect(() => syncUiFont(), [])
  useEffect(() => initSound(), [])
  useEffect(() => startAutoUpdate(), [])
  useCaptureResponder()
  useEffect(() => {
    document.getElementById('boot-splash')?.remove()
  }, [])

  return (
    <NuqsAdapter>
      <ToastProvider>
        <div className="flex h-dvh flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {framed ? (
              <AppShell>
                <Outlet />
              </AppShell>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
        <Onboarding />
      </ToastProvider>
    </NuqsAdapter>
  )
}
