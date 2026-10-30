import { captureBrowserElement } from '../../packages/canvas/src/browser-capture'

// Isolated extension world; no page globals or page-to-extension messaging.
if (globalThis.__sheetCaptureCancel) globalThis.__sheetCaptureCancel()
let selected = null
let busy = false
let cancelled = false
const overlay = document.createElement('div')
overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #f97316;box-sizing:border-box;background:#f9731618'
const hint = document.createElement('div')
hint.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;top:12px;left:12px;padding:12px 16px;border-radius:8px;background:#18181b;color:white;font:14px/1.5 system-ui;max-width:440px'
hint.textContent = 'Sheet: hover a section and click to capture. ↑ selects its parent. Esc cancels. Keep the whole section visible.'
document.documentElement.append(overlay, hint)
const highlight = () => {
  if (!selected) return
  const rect = selected.getBoundingClientRect()
  Object.assign(overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
}
const move = (event) => {
  if (busy) return
  selected = event.target
  highlight()
}
const blockPointer = (event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
}
const cancel = () => {
  cancelled = true
  overlay.remove()
  hint.remove()
  window.removeEventListener('pointermove', move, true)
  window.removeEventListener('click', click, true)
  window.removeEventListener('keydown', key, true)
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) window.removeEventListener(type, blockPointer, true)
  delete globalThis.__sheetCaptureCancel
}
const key = (event) => {
  if (event.key === 'Escape') {
    // The page must not also act on the Escape that cancels capture.
    event.preventDefault()
    event.stopImmediatePropagation()
    cancel()
  }
  if (event.key === 'ArrowUp' && selected?.parentElement && !busy) {
    event.preventDefault()
    event.stopImmediatePropagation()
    selected = selected.parentElement
    highlight()
  }
}
const click = async (event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (busy || !selected) return
  busy = true
  overlay.remove()
  hint.remove()
  // Chrome pauses animation frames in background tabs, so the timeout covers the compositor wait too.
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Capture timed out. Try again.')), 15_000) })
  try {
    // Let the compositor remove selection UI before requesting visible pixels.
    const response = await Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        .then(() => chrome.runtime.sendMessage({ type: 'sheet-capture-pixels' })),
      timeout,
    ]).finally(() => clearTimeout(timer))
    if (!response?.data) throw new Error(response?.error || 'Could not capture this tab.')
    const image = new Image()
    image.src = response.data
    await image.decode()
    const scaleX = image.naturalWidth / innerWidth
    const scaleY = image.naturalHeight / innerHeight
    const result = await captureBrowserElement(selected, async (element) => {
      const rect = element.getBoundingClientRect()
      const canvas = document.createElement('canvas')
      const fit = Math.min(1, 4096 / (rect.width * scaleX), 4096 / (rect.height * scaleY), Math.sqrt(12_000_000 / (rect.width * scaleX * rect.height * scaleY)))
      canvas.width = Math.max(1, Math.round(rect.width * scaleX * fit))
      canvas.height = Math.max(1, Math.round(rect.height * scaleY * fit))
      canvas.getContext('2d').drawImage(image, rect.left * scaleX, rect.top * scaleY, rect.width * scaleX, rect.height * scaleY, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    })
    if (cancelled) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'capture.sheet-capture.json'
    cancel()
    document.documentElement.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    if (cancelled) return
    busy = false
    hint.textContent = `Sheet: ${error.message} Click to retry or Esc to cancel.`
    document.documentElement.append(overlay, hint)
    highlight()
  }
}
window.addEventListener('pointermove', move, true)
window.addEventListener('click', click, true)
window.addEventListener('keydown', key, true)
for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) window.addEventListener(type, blockPointer, true)
globalThis.__sheetCaptureCancel = cancel
