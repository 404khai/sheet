import type { Platform } from './diagrams'

export const REPO = 'https://github.com/DeepanshuMishraa/sheet'

/**
 * Fixed names, so the links keep working across versions: the release workflow
 * uploads every build under these names.
 */
const FILES = {
  macos: 'Sheet-macos-arm64.dmg',
  windows: 'Sheet-windows-x64.exe',
  linux: 'Sheet-linux-x64.AppImage',
} as const

export type DownloadTarget = keyof typeof FILES

export const targetName: Record<DownloadTarget, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

/** Which build the visitor can actually run. */
export function downloadTarget(platform: Platform): DownloadTarget {
  if (platform === 'Windows') return 'windows'
  if (platform === 'Linux') return 'linux'
  return 'macos'
}

export function downloadUrl(target: DownloadTarget) {
  return `${REPO}/releases/latest/download/${FILES[target]}`
}

/** The link text: `Download for Windows`, and so on. */
export function downloadLabel(target: DownloadTarget) {
  return `Download for ${targetName[target]}`
}
