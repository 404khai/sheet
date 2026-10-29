import type { Platform } from './diagrams'

/** The close/minimise controls of a window on the given platform. */
export function WindowControls({ platform }: { platform: Platform }) {
  if (platform === 'macOS') {
    return (
      <span className="lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    )
  }
  if (platform === 'Windows') {
    return (
      <span className="win-controls" aria-hidden="true">
        <svg viewBox="0 0 12 12">
          <path d="M1 6h10" />
        </svg>
        <svg viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" />
        </svg>
        <svg viewBox="0 0 12 12">
          <path d="M1 1l10 10M11 1 1 11" />
        </svg>
      </span>
    )
  }
  return (
    <span className="linux-controls" aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M3 3l6 6M9 3 3 9" />
      </svg>
    </span>
  )
}
