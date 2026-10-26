import { useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import { downloadUrl, type DownloadTarget } from './download'

/** Sheet is ad-hoc signed, not notarized, so macOS quarantines the first copy it downloads. */
export const UNQUARANTINE = 'sudo xattr -rd com.apple.quarantine /Applications/Sheet.app'

const COUNTDOWN_SECONDS = 3

/** Hands the file to the browser without leaving the page. */
function startDownload(href: string) {
  const link = document.createElement('a')
  link.href = href
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

/**
 * Shown when Download is pressed. It says why the system will object to the app
 * and, on macOS, gives the one command that fixes it, then starts the download
 * itself after a short countdown, so the instruction is read before the file
 * arrives.
 */
export function DownloadDialog({
  open,
  target,
  onClose,
}: {
  open: boolean
  target: DownloadTarget
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [left, setLeft] = useState(COUNTDOWN_SECONDS)
  const [started, setStarted] = useState(false)
  const [copied, setCopied] = useState(false)
  const href = downloadUrl(target)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setLeft(COUNTDOWN_SECONDS)
      setStarted(false)
      setCopied(false)
      dialog.showModal()
      play('open', { emphasis: 'subtle' })
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open || started) return
    if (left <= 0) {
      startDownload(href)
      setStarted(true)
      play('success', { emphasis: 'subtle' })
      return
    }
    const timer = window.setTimeout(() => setLeft((seconds) => seconds - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [open, left, started, href])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(UNQUARANTINE)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="download-title"
      onClose={onClose}
      onClick={(event) => {
        // A press on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-panel">
        <h2 id="download-title">Before you open Sheet</h2>
        {target === 'macos' ? (
          <>
            <p className="muted">
              Sheet is not signed by Apple yet, so macOS will refuse to open it the first time. After
              you drag it into Applications, run this once in Terminal:
            </p>

            <div className="code">
              <code>{UNQUARANTINE}</code>
              <button
                type="button"
                className="button button-small"
                data-cuelume-tap
                onClick={() => void copy()}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            Sheet is not code-signed yet, so Windows SmartScreen will warn about an unrecognised app
            the first time. Click <strong>More info</strong> in the warning, then{' '}
            <strong>Run anyway</strong>.
          </p>
        )}

        <p className="muted dialog-note">
          Only the first {target === 'macos' ? 'install' : 'launch'} needs it. After that, Sheet
          updates itself.{' '}
          {target === 'macos' ? 'Apple Silicon Macs only.' : 'Windows 10 or 11, 64-bit.'}
        </p>

        <div className="dialog-foot">
          <div className="countdown" role="status">
            <span>{started ? 'Download started.' : `Download starts in ${left}s`}</span>
            <span className="countdown-bar" aria-hidden="true" data-done={started}>
              <i style={{ animationDuration: `${COUNTDOWN_SECONDS}s` }} />
            </span>
          </div>
          <div className="dialog-actions">
            {started ? null : (
              <button type="button" className="button" data-cuelume-tap onClick={() => setLeft(0)}>
                Download now
              </button>
            )}
            <button type="button" className="button button-solid" data-cuelume-tap onClick={onClose}>
              {started ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
