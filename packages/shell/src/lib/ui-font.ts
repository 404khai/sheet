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
    label: 'Paper Mono',
    category: 'Monospace',
    stack: "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    monoStack: "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    previewText: 'Crafted monospace',
  },
  {
    id: 'open-runde',
    label: 'Open Runde',
    category: 'Sans Serif',
    stack: "'Open Runde', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Soft rounded humanist',
  },
  {
    id: 'geist',
    label: 'Geist',
    category: 'Sans Serif',
    stack: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Precise technical neo-grotesque',
  },
  {
    id: 'geist-mono',
    label: 'Geist Mono',
    category: 'Monospace',
    stack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    monoStack: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    previewText: 'Clean developer monospace',
  },
  {
    id: 'onest',
    label: 'Onest',
    category: 'Sans Serif',
    stack: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Clean modern geometric',
  },
  {
    id: 'cal-sans',
    label: 'Cal Sans',
    category: 'Display',
    stack: "'Cal Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Tight editorial geometric',
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'Sans Serif',
    stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Neutral, highly legible',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'Sans Serif',
    stack: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Friendly low-contrast sans',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    category: 'Sans Serif',
    stack: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    previewText: 'Semi-rounded modern sans',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'Display',
    stack: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
    previewText: 'Brutalist expressive grotesk',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    category: 'Sans Serif',
    stack: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    previewText: 'Contemporary digital brand',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'Monospace',
    stack: "'JetBrains Mono', ui-monospace, monospace",
    monoStack: "'JetBrains Mono', ui-monospace, monospace",
    previewText: 'Code-optimized reading',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    category: 'Monospace',
    stack: "'Fira Code', ui-monospace, monospace",
    monoStack: "'Fira Code', ui-monospace, monospace",
    previewText: 'High-fidelity monospaced',
  },
  {
    id: 'system',
    label: 'System UI',
    category: 'Sans Serif',
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Noto Sans', Helvetica, Arial, sans-serif",
    previewText: 'Your system\'s own face',
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
