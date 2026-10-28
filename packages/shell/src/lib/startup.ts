/** Where a new window opens: Home, or straight back into the last file. */
export type StartupView = 'home' | 'last-file'

const STORAGE_KEY = 'sheet:open-on-start'

export const DEFAULT_STARTUP_VIEW: StartupView = 'home'

export function getStartupView(): StartupView {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'last-file' ? 'last-file' : 'home'
  } catch {
    return DEFAULT_STARTUP_VIEW
  }
}

export function setStartupView(view: StartupView) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, view)
  } catch {
    // The choice cannot be kept without storage; the window opens on Home.
  }
}
