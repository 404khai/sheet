const FONT_STORAGE_KEY = 'sheet:ui-font'
const WEIGHT_STORAGE_KEY = 'sheet:ui-font-weight'

export interface UiFont {
  id: string
  label: string
  category: 'Monospace' | 'Sans Serif' | 'Display'
  stack: string
  monoStack?: string
  previewText?: string
}

export const UI_FONTS: readonly UiFont[] = [
  {
    id: 'paper-mono',
    label: 'Paper Mono (Current)',
    category: 'Monospace',
    stack: "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    monoStack: "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    previewText: 'Sheet 0123 — Crafted Monospace',
  },
  {
    id: 'open-runde',
    label: 'Open Runde',
    category: 'Sans Serif',
    stack: "'Open Runde', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Soft Rounded Humanist',
  },
  {
    id: 'geist',
    label: 'Geist',
    category: 'Sans Serif',
    stack: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Precise Technical Neo-Grotesque',
  },
  {
    id: 'geist-mono',
    label: 'Geist Mono',
    category: 'Monospace',
    stack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    monoStack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    previewText: 'Sheet 0123 — Clean Developer Monospace',
  },
  {
    id: 'onest',
    label: 'Onest',
    category: 'Sans Serif',
    stack: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Ultra-Clean Modern Geometric',
  },
  {
    id: 'cal-sans',
    label: 'Cal Sans',
    category: 'Display',
    stack: "'Cal Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Tight Editorial Geometric',
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'Sans Serif',
    stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Neutral High-Legibility UI',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'Sans Serif',
    stack: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Friendly Low-Contrast Sans',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    category: 'Sans Serif',
    stack: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Sheet 0123 — Semi-Rounded Modern Sans',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'Display',
    stack: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
    previewText: 'Sheet 0123 — Brutalist Expressive Grotesk',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    category: 'Sans Serif',
    stack: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    previewText: 'Sheet 0123 — Contemporary Digital Brand',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'Monospace',
    stack: "'JetBrains Mono', ui-monospace, monospace",
    monoStack: "'JetBrains Mono', ui-monospace, monospace",
    previewText: 'Sheet 0123 — Code-Optimized Reading',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    category: 'Monospace',
    stack: "'Fira Code', ui-monospace, monospace",
    monoStack: "'Fira Code', ui-monospace, monospace",
    previewText: 'Sheet 0123 — High-Fidelity Monospaced',
  },
  {
    id: 'system',
    label: 'System UI',
    category: 'Sans Serif',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    previewText: 'Sheet 0123 — Native Apple / OS Engine',
  },
] as const

export type UiFontId = (typeof UI_FONTS)[number]['id']

export const DEFAULT_UI_FONT: UiFontId = 'paper-mono'

export interface UiFontWeight {
  value: number
  label: string
}

export const UI_FONT_WEIGHTS: readonly UiFontWeight[] = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
] as const

export type UiFontWeightValue = (typeof UI_FONT_WEIGHTS)[number]['value']

export const DEFAULT_UI_FONT_WEIGHT: UiFontWeightValue = 400

export function isUiFontId(value: unknown): value is UiFontId {
  return UI_FONTS.some((font) => font.id === value)
}

export function isUiFontWeight(value: unknown): value is UiFontWeightValue {
  return UI_FONT_WEIGHTS.some((weight) => weight.value === value)
}

export function getUiFont(): UiFontId {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage ?? null
    const stored = storage?.getItem(FONT_STORAGE_KEY) ?? null
    return isUiFontId(stored) ? stored : DEFAULT_UI_FONT
  } catch {
    return DEFAULT_UI_FONT
  }
}

export function getUiFontWeight(): UiFontWeightValue {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage ?? null
    const stored = storage?.getItem(WEIGHT_STORAGE_KEY)
    if (!stored) return DEFAULT_UI_FONT_WEIGHT
    const parsed = Number(stored)
    return isUiFontWeight(parsed) ? parsed : DEFAULT_UI_FONT_WEIGHT
  } catch {
    return DEFAULT_UI_FONT_WEIGHT
  }
}

export function applyUiFont(
  fontId: UiFontId = getUiFont(),
  weight: UiFontWeightValue = getUiFontWeight(),
) {
  if (typeof document === 'undefined') return
  const font = UI_FONTS.find((entry) => entry.id === fontId) ?? UI_FONTS[0]
  const root = document.documentElement

  // Set BOTH sans and mono, plus ui-font-family, so every single element
  // whether using font-sans, font-mono, or default inheritance, switches to this font!
  root.style.setProperty('--sheet-font-sans', font.stack)
  root.style.setProperty('--sheet-font-mono', font.stack)
  root.style.setProperty('--ui-font-family', font.stack)

  // Master font weight and proportional scale levels
  const w = Number(weight) || 400
  root.style.setProperty('--ui-font-weight', String(w))
  root.style.setProperty('--ui-weight-light', String(Math.max(100, w - 100)))
  root.style.setProperty('--ui-weight-normal', String(w))
  root.style.setProperty('--ui-weight-medium', String(Math.min(900, w + 100)))
  root.style.setProperty('--ui-weight-semibold', String(Math.min(900, w + 200)))
  root.style.setProperty('--ui-weight-bold', String(Math.min(900, w + 300)))
  root.style.fontWeight = String(w)
}

export function setUiFont(fontId: UiFontId) {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage ?? null
    storage?.setItem(FONT_STORAGE_KEY, fontId)
  } catch {}
  applyUiFont(fontId, getUiFontWeight())
}

export function setUiFontWeight(weight: UiFontWeightValue) {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage ?? null
    storage?.setItem(WEIGHT_STORAGE_KEY, String(weight))
  } catch {}
  applyUiFont(getUiFont(), weight)
}

/** Applies the stored font and weight and keeps all windows in sync. */
export function syncUiFont() {
  applyUiFont()
  if (typeof window === 'undefined') return () => {}
  const handleStorage = (event: StorageEvent) => {
    if (event.key === FONT_STORAGE_KEY || event.key === WEIGHT_STORAGE_KEY) {
      applyUiFont()
    }
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}
