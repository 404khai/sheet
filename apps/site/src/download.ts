import type { Platform } from './diagrams'

export const REPO = 'https://github.com/DeepanshuMishraa/sheet'

/**
 * Fixed names, so the links keep working across versions: the release workflow
 * uploads both builds under these names.
 */
const FILES = {
  macos: 'Sheet-macos-arm64.dmg',
  windows: 'Sheet-windows-x64.exe',
} as const

export type DownloadTarget = keyof typeof FILES

export const targetName: Record<DownloadTarget, string> = {
  macos: 'macOS',
  windows: 'Windows',
}

/**
 * Which build the visitor can actually run. Linux is detected for the window
 * mockups but has no build of its own yet, so it is offered the Mac app.
 */
export function downloadTarget(platform: Platform): DownloadTarget {
  return platform === 'Windows' ? 'windows' : 'macos'
}

export function downloadUrl(target: DownloadTarget) {
  return `${REPO}/releases/latest/download/${FILES[target]}`
}

/** The link text: `Download for Windows`, and so on. */
export function downloadLabel(target: DownloadTarget) {
  return `Download for ${targetName[target]}`
}
