import type { DownloadTarget } from './download'

/** The Apple mark, at its own tall aspect ratio. */
export function AppleMark() {
  return (
    <svg className="mark" viewBox="0 0 814 1000" aria-hidden="true">
      <path
        fill="currentColor"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </svg>
  )
}

/** The Windows mark, in its own blue. */
export function WindowsMark() {
  return (
    <svg className="mark" viewBox="0 0 88 88" aria-hidden="true">
      <path
        fill="#00adef"
        d="m0 12.402 35.687-4.86.016 34.423-35.67.203zm35.67 33.529.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349-.011 41.34-47.318-6.678-.066-34.739z"
      />
    </svg>
  )
}

/** A penguin silhouette for Linux, in the current text colour. */
export function LinuxMark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.5 2C9.9 2 8.6 4.1 8.6 6.6c0 1.2-.3 2.1-1 3.2-1.1 1.7-2.6 3.8-2.6 6.2 0 1 .3 1.8.8 2.3-.3.7-.9 1.2-1.8 1.5-.6.2-.5.9.1 1.1 1.1.3 2.8.4 3.9-.4.7.3 1.5.5 2.5.5 1.2 0 2.2-.3 3-.7.9.6 2.3.6 3.6.3.6-.1.9-.7.4-1.1-.9-.6-1.3-1.2-1.4-1.9.9-.8 1.4-2 1.4-3.5 0-2.1-1.1-3.7-2.1-5.1-.8-1.1-1.3-2.1-1.3-3.4C15.9 4 14.9 2 12.5 2Zm-1.2 3.3c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1Zm2.6 0c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1ZM12.6 8c.8 0 1.5.5 1.5.9s-.9.9-1.5.9-1.5-.4-1.5-.9S11.8 8 12.6 8Z"
      />
    </svg>
  )
}

export function PlatformMark({ target }: { target: DownloadTarget }) {
  if (target === 'windows') return <WindowsMark />
  if (target === 'linux') return <LinuxMark />
  return <AppleMark />
}
