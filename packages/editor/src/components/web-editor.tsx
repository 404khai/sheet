import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeXmlIcon,
  ColorsIcon,
  ComponentIcon,
  CropIcon,
  EyeIcon,
  EyeOffIcon,
  File01Icon,
  FrameIcon,
  HandIcon,
  LayoutGridIcon,
  ImageIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MinusIcon,
  MousePointer2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  PenTool01Icon,
  PlusCircleIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from '@sheet/ui/icons'
import { ConnectAgent } from './connect-agent'
import { FramePresetsPanel } from './frame-presets-panel'
import { frameNode, freeFrameSpot, NEW_FRAME_SIZE, type FramePreset } from '@sheet/canvas/web-frames'
import { IconsPanel } from './icon-panel'
import {
  AlignmentGrid,
  IconToggle,
  InspectorSection,
  OptionalSection,
  collectSelectionColors,
  readShadows,
  replaceColorInStyles,
  toColorInputValue,
  writeShadows,
  type SelectionColor,
} from './inspector-controls'
import { ShaderGallery } from './shader-panel'
import { documentFonts, firstFamily, SYSTEM_FONT_STACKS, type DocumentFont } from '../lib/fonts'
import { iconInfo, iconStyleOperation, isIconNode, type IconLibrary } from '@sheet/canvas/web-icon-style'
import { isShaderNode, prewarmShaderThumbnails, shaderInfo, shaderNode, shaderPatchOperation, type ShaderName } from '@sheet/canvas/web-shaders'
import { Button } from '@sheet/ui/button'
import { cn } from '@sheet/ui/utils'
import {
  applyWebTransaction,
  webId,
  createWebElement,
  createWebStyleSheet,
  createWebText,
  orderedWebChildren,
  webNodeIdFromElement,
  type WebDocument,
  type WebNode,
  type WebRulePatch,
  type WebTransaction,
} from '@sheet/canvas/web-model'
import type { WebStyleRule } from '@sheet/canvas/web-css'
import { ThemePanel } from './theme-panel'
import { boundNodeIndex, type WebOverride } from '@sheet/canvas/web-components'
import {
  NAME_ATTRIBUTE,
  PAGE_ATTRIBUTE,
  layerChildren,
  layerKind,
  layerName,
  isBoundedPage,
  listPages,
  openingPageId,
  nextPageName,
  nextRootOrder,
  pageLayerIds,
  pageNode,
  pageParentId,
  planLayerMove,
  type LayerDropZone,
  canvasParentId,
  pageRootSize,
  resolvePageId,
  stageColor,
  visibleRootIds,
  type LayerKind,
} from '@sheet/canvas/web-pages'
import { WebDocumentView } from '@sheet/canvas/web-react'
import { AssetsPanel, assetSrc } from './assets-panel'
import { useRegisterOpenTab } from '../lib/open-tabs'
import { useChromeSlots } from './chrome-slots'
import { createPortal } from 'react-dom'
import { PanelResizer, usePanelWidth } from './panel-resize'
import { PanelSegment, PanelTabs } from './panel-tabs'
import { useRegisterCommands, type AppCommand } from '../lib/command-registry'
import { Sound } from '@sheet/ui/sound'
import { useDesignComments } from '../lib/use-comments'
import { CommentPin, CommentThread, CommentsList } from './comments'
import { ExportMenu } from './export-menu'
import { BrowserCaptureImport } from './browser-capture-import'
import { browserCaptureTransaction } from '@sheet/canvas/browser-capture'
import { CopyImageButton } from './copy-image-button'
import { captureImage } from '../lib/capture-client'
import { copyImage } from '../lib/copy-image'
import { compileWebStandaloneHtml } from '@sheet/canvas/web-export'
import { orpc } from '@sheet/rpc/client'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@sheet/ui/dialog'
import {
  formatBuiltInChord,
  isEditableTarget,
  loadCachedShortcuts,
  matchShortcut,
  normalizeConfig,
  type BuiltInShortcutId,
  type ShortcutConfig,
} from '../lib/shortcuts'
import { subscribeCanvasChanges, type AgentActivity } from '../lib/canvas-events'

const ELEMENT_TAGS = [
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'button',
  'input',
  'img',
  'h1',
  'h2',
  'h3',
  'p',
  'span',
  'a',
] as const

const STYLE_GROUPS = [
  {
    label: 'Layout',
    properties: [
      'display',
      'position',
      'width',
      'height',
      'margin',
      'padding',
      'gap',
      'flex-direction',
      'flex-wrap',
      'align-items',
      'justify-content',
      'grid-template-columns',
    ],
  },
  {
    label: 'Typography',
    properties: [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'color',
    ],
  },
  {
    label: 'Appearance',
    properties: [
      'background',
      'border',
      'border-radius',
      'opacity',
    ],
  },
] as const

interface Camera {
  x: number
  y: number
  zoom: number
}

interface OverlayRect {
  left: number
  top: number
  width: number
  height: number
}

/** The canvas floor: dots that travel and scale with the camera, so panning reads as movement. */
const stageDots = (camera: Camera): CSSProperties => {
  const step = 24 * camera.zoom
  const size = step < 10 ? step * 4 : step
  return {
    backgroundImage: 'radial-gradient(var(--cx-dot) 1px, transparent 1px)',
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${camera.x}px ${camera.y}px`,
  }
}

const cameraTransform = (camera: Camera) => `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`

/** Keep the previous object when nothing changed, so React skips the render. */
const keepRect = (next: OverlayRect | null) => (prev: OverlayRect | null) =>
  prev === next ||
  (prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height)
    ? prev
    : next

/** Same idea as `keepRect`, for a record of rects keyed by node id. */
const keepRects = (next: Record<string, OverlayRect>) => (prev: Record<string, OverlayRect>) => {
  const keys = Object.keys(next)
  return keys.length === Object.keys(prev).length &&
    keys.every((key) => {
      const before = prev[key]
      const after = next[key]
      return before && after && before.left === after.left && before.top === after.top && before.width === after.width && before.height === after.height
    })
    ? prev
    : next
}

const keepRecord = (next: Record<string, string>) => (prev: Record<string, string>) => {
  const keys = Object.keys(next)
  return keys.length === Object.keys(prev).length && keys.every((key) => prev[key] === next[key]) ? prev : next
}

interface DrawingDraft {
  pointerId: number
  tool: 'frame' | 'box' | 'pen' | 'text' | 'image'
  start: { x: number; y: number }
  end: { x: number; y: number }
  points: { x: number; y: number }[]
}

interface DragState {
  mode: 'move' | 'resize' | 'pan' | 'page-resize'
  pointerId: number
  startX: number
  startY: number
  element?: HTMLElement | SVGElement
  moveKind?: DragMoveKind
  authoredLeft: number | null
  authoredTop: number | null
  authoredWidth: number | null
  authoredHeight: number | null
  camera?: Camera
  pageCorner?: 'nw' | 'ne' | 'sw' | 'se'
  /** Which sides of the box a `resize` drag is pulling. */
  resizeEdges?: ResizeEdges
  /** The layer sits in the page's flow and becomes free-positioned when this drag moves it. */
  pinAbsolute?: boolean
}

/** Where each of the eight handles sits on the selection box, and which sides it pulls. */
const RESIZE_HANDLES: ReadonlyArray<{
  id: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  label: string
  edges: ResizeEdges
  position: string
  cursor: string
}> = [
  { id: 'nw', label: 'top left', edges: { n: true, w: true }, position: '-left-[5px] -top-[5px]', cursor: 'cursor-nwse-resize' },
  { id: 'n', label: 'top', edges: { n: true }, position: 'left-1/2 -top-[5px] -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { id: 'ne', label: 'top right', edges: { n: true, e: true }, position: '-right-[5px] -top-[5px]', cursor: 'cursor-nesw-resize' },
  { id: 'e', label: 'right', edges: { e: true }, position: '-right-[5px] top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
  { id: 'se', label: 'bottom right', edges: { s: true, e: true }, position: '-bottom-[5px] -right-[5px]', cursor: 'cursor-nwse-resize' },
  { id: 's', label: 'bottom', edges: { s: true }, position: 'left-1/2 -bottom-[5px] -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { id: 'sw', label: 'bottom left', edges: { s: true, w: true }, position: '-bottom-[5px] -left-[5px]', cursor: 'cursor-nesw-resize' },
  { id: 'w', label: 'left', edges: { w: true }, position: '-left-[5px] top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
]

/** The sides of a box a resize handle moves: a corner is two of them, an edge is one. */
export interface ResizeEdges {
  n?: boolean
  s?: boolean
  e?: boolean
  w?: boolean
}

export interface ResizeBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The box after dragging some of its sides by (dx, dy) canvas px. A side on the
 * far edge (east, south) grows the box; a side on the near edge (west, north)
 * moves the origin and shrinks the box by the same amount, so the opposite edge
 * stays where it was. Width and height never go below 1px.
 */
export function resizeFromEdges(start: ResizeBox, edges: ResizeEdges, dx: number, dy: number): ResizeBox {
  let { left, top, width, height } = start
  if (edges.e) width = Math.max(1, start.width + dx)
  if (edges.w) {
    width = Math.max(1, start.width - dx)
    left = start.left + (start.width - width)
  }
  if (edges.s) height = Math.max(1, start.height + dy)
  if (edges.n) {
    height = Math.max(1, start.height - dy)
    top = start.top + (start.height - height)
  }
  return {
    left: roundAuthoredCss(left),
    top: roundAuthoredCss(top),
    width: roundAuthoredCss(width),
    height: roundAuthoredCss(height),
  }
}

export type DragMoveKind = 'reorder' | 'absolute'

export function dragMoveKind(computedPosition: string): DragMoveKind {
  return computedPosition === 'absolute' || computedPosition === 'fixed'
    ? 'absolute'
    : 'reorder'
}

const PX_AUTHORED = /^(-?\d+(?:\.\d+)?)px$/

export function parsePxAuthored(value: string | undefined): number | null {
  if (value === undefined) return null
  const match = value.trim().match(PX_AUTHORED)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

export function roundAuthoredCss(value: number): number {
  return Math.round(value * 100) / 100
}

export function commitAbsoluteMove(
  start: { left: number; top: number },
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  zoom: number,
): { left: string; top: string } {
  return {
    left: `${roundAuthoredCss(start.left + (clientX - startX) / zoom)}px`,
    top: `${roundAuthoredCss(start.top + (clientY - startY) / zoom)}px`,
  }
}

export interface ResizeCommit {
  width?: string
  height?: string
  declined: string[]
}

export function commitResize(
  start: { width: number | null; height: number | null },
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  zoom: number,
): ResizeCommit {
  const commit: ResizeCommit = { declined: [] }
  if (start.width !== null) {
    commit.width = `${roundAuthoredCss(Math.max(1, start.width + (clientX - startX) / zoom))}px`
  } else {
    commit.declined.push('width')
  }
  if (start.height !== null) {
    commit.height = `${roundAuthoredCss(Math.max(1, start.height + (clientY - startY) / zoom))}px`
  } else {
    commit.declined.push('height')
  }
  return commit
}

export function reorderAxis(computedDisplay: string, computedFlexDirection: string): 'x' | 'y' {
  if (computedDisplay.includes('flex') && computedFlexDirection.includes('row')) return 'x'
  return 'y'
}

export interface ReorderSibling {
  id: string
  order: number
  top: number
  left: number
  bottom: number
  right: number
}

export function computeReorderOrder(
  siblings: ReorderSibling[],
  draggedId: string,
  draggedOrder: number,
  pointerX: number,
  pointerY: number,
  axis: 'x' | 'y',
): number | null {
  const sorted = [...siblings].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  )
  const pointer = axis === 'x' ? pointerX : pointerY
  let index = sorted.length
  for (let cursor = 0; cursor < sorted.length; cursor += 1) {
    const sibling = sorted[cursor] as ReorderSibling
    const center = axis === 'x'
      ? (sibling.left + sibling.right) / 2
      : (sibling.top + sibling.bottom) / 2
    if (pointer < center) {
      index = cursor
      break
    }
  }
  const withoutDragged = sorted.filter((sibling) => sibling.id !== draggedId)
  const fromIndex = sorted.findIndex((sibling) => sibling.id === draggedId)
  const slot = fromIndex !== -1 && index > fromIndex ? index - 1 : index
  if (fromIndex !== -1 && slot === fromIndex) return null
  const before = slot === 0 ? null : withoutDragged[slot - 1]?.order
  const after = slot >= withoutDragged.length ? null : withoutDragged[slot]?.order
  if (before === undefined || after === undefined) return null
  if (before === null && after === null) return draggedOrder
  if (before === null) return (after as number) - 1_024
  if (after === null) return before + 1_024
  if (after - before < 2) return before + 1
  return (before + after) / 2
}

/** Shapes inside an icon are not editable on their own: canvas picks resolve to the icon's svg. */
/**
 * Things that are objects in their own right: an image, an icon, a shader. They
 * can be taken out of their parent's flow and placed anywhere, wherever they are
 * nested, instead of being fixed in a layout the way text and boxes are.
 */
function isFreeObject(node: WebNode | null | undefined) {
  if (node?.kind !== 'element') return false
  const kind = layerKind(node)
  return kind === 'image' || kind === 'svg' || isShaderNode(node)
}

/** An element that holds other layers: a pane or card, as opposed to text or a lone box. */
function isFrameInFrame(document: WebDocument, id: string) {
  const node = document.nodes[id]
  return node?.kind === 'element' && orderedWebChildren(document, id).length > 0
}

function pickTarget(document: WebDocument, id: string | null) {
  for (let current = id ? document.nodes[id] : undefined; current; current = current.parentId ? document.nodes[current.parentId] : undefined) {
    if (isIconNode(current)) return current.id
  }
  return id
}

function nodeLabel(node: WebNode, document?: WebDocument) {
  return layerName(node, document)
}

const layerIconClass = 'size-4 shrink-0'

function LayerGlyphShape({ kind }: { kind: LayerKind }) {
  switch (kind) {
    case 'text':
      return <span aria-hidden className="grid size-4 shrink-0 place-items-center text-[11px] font-semibold leading-none">Aa</span>
    case 'frame-row':
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={layerIconClass} fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2" y="2.5" width="5" height="11" rx="1" />
          <rect x="9" y="2.5" width="5" height="11" rx="1" />
        </svg>
      )
    case 'frame-column':
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={layerIconClass} fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2.5" y="2" width="11" height="5" rx="1" />
          <rect x="2.5" y="9" width="11" height="5" rx="1" />
        </svg>
      )
    case 'svg':
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={layerIconClass} fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3" y="3" width="10" height="10" rx="1" />
          <path d="M1.5 3h3M11.5 3h3M1.5 13h3M11.5 13h3" />
        </svg>
      )
    case 'shape':
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={layerIconClass} fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="1.5" y="5.5" width="13" height="5" rx="2.5" />
        </svg>
      )
    case 'image':
      return <ImageIcon className={layerIconClass} />
    case 'link':
      return <CodeXmlIcon className={layerIconClass} />
    case 'input':
      return <PencilIcon className={layerIconClass} />
    case 'button':
      return <SquareIcon className={layerIconClass} />
    case 'frame':
      return <FrameIcon className={layerIconClass} />
    default:
      return <SquareIcon className={layerIconClass} />
  }
}

/** One hue per kind of layer, so a long tree can be scanned by colour as well as by shape. */
const LAYER_TONE: Record<LayerKind, string> = {
  frame: 'text-chart-5',
  'frame-row': 'text-chart-5',
  'frame-column': 'text-chart-5',
  text: 'text-chart-3',
  image: 'text-chart-4',
  svg: 'text-chart-2',
  shape: 'text-chart-2',
  link: 'text-cx-accent',
  button: 'text-cx-accent',
  input: 'text-cx-accent',
  element: 'text-muted-foreground',
}

function LayerGlyph({ kind }: { kind: LayerKind }) {
  return (
    <span className={cn('inline-flex shrink-0', LAYER_TONE[kind] ?? 'text-muted-foreground')}>
      <LayerGlyphShape kind={kind} />
    </span>
  )
}

function nodeIcon(node: WebNode) {
  return <LayerGlyph kind={layerKind(node)} />
}

function nextOrder(document: WebDocument, parentId: string | null) {
  return (orderedWebChildren(document, parentId).at(-1)?.order ?? 0) + 1_024
}

/** True when `ancestorId` is somewhere above `id` in the node tree. */
function hasAncestor(document: WebDocument, id: string, ancestorId: string) {
  let parentId = document.nodes[id]?.parentId ?? null
  while (parentId !== null) {
    if (parentId === ancestorId) return true
    parentId = document.nodes[parentId]?.parentId ?? null
  }
  return false
}

function collectSubtreeIds(document: WebDocument, rootId: string): string[] {
  const ids: string[] = []
  const visit = (id: string) => {
    const node = document.nodes[id]
    if (!node) return
    ids.push(id)
    for (const child of orderedWebChildren(document, id)) visit(child.id)
  }
  visit(rootId)
  return ids
}

export function cloneSubtreeFresh(document: WebDocument, rootId: string): WebNode[] {
  const root = document.nodes[rootId]
  if (!root) throw new Error(`Node ${rootId} does not exist`)
  const clones: WebNode[] = []
  const visit = (source: WebNode, parentId: string | null): void => {
    const id = webId(source.kind)
    clones.push(
      source.kind === 'text'
        ? { ...source, id, parentId }
        : {
          ...source,
          id,
          parentId,
          attributes: { ...source.attributes },
          styles: { ...source.styles },
        },
    )
    for (const child of orderedWebChildren(document, source.id)) visit(child, id)
  }
  visit(root, null)
  return clones
}

function initialStyles(tag: string): Record<string, string> {
  if (tag === 'div') {
    return {
      width: '160px',
      height: '96px',
      background: '#2a2a2a',
    }
  }
  if (tag === 'button') {
    return {
      padding: '10px 16px',
      background: '#18181b',
      color: '#ffffff',
      border: '0',
      'border-radius': '8px',
    }
  }
  if (tag === 'img') return { width: '240px', height: '160px', 'object-fit': 'cover' }
  if (tag === 'input') return { padding: '8px 10px', border: '1px solid #333333', background: '#222222', color: '#ffffff' }
  return {}
}

function initialText(tag: string) {
  if (tag === 'button') return 'Button'
  if (tag === 'h1') return 'Heading 1'
  if (tag === 'h2') return 'Heading 2'
  if (tag === 'h3') return 'Heading 3'
  if (tag === 'p') return 'Paragraph'
  if (tag === 'span') return 'Text'
  if (tag === 'a') return 'Link'
  return null
}

function PageRow({
  name,
  active,
  pageSelected,
  removable,
  onSelect,
  onRename,
  onDelete,
}: {
  name: string
  active: boolean
  pageSelected: boolean
  removable: boolean
  onSelect: () => void
  onRename: ((name: string) => void) | null
  onDelete: (() => void) | null
}) {
  const [editing, setEditing] = useState(false)
  const current = active && pageSelected
  return (
    <div
      className={cn(
        'group mx-2 my-0.5 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xs transition-[background-color,color,box-shadow] duration-150 ease-smooth',
        active
          ? 'bg-cx-accent/10 font-medium text-foreground ring-1 ring-inset ring-cx-accent/25'
          : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
        current && 'font-semibold',
      )}
    >
      {editing && onRename ? (
        <>
          <File01Icon className="size-4 shrink-0 text-muted-foreground" />
          <InlineName
            value={name}
            onCancel={() => setEditing(false)}
            onCommit={(value) => {
              setEditing(false)
              if (value.trim() && value.trim() !== name) onRename(value)
            }}
          />
        </>
      ) : (
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onSelect}
          onDoubleClick={() => {
            if (onRename) setEditing(true)
          }}
        >
          <File01Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </button>
      )}
      {removable && onDelete && !editing ? (
        <button
          type="button"
          aria-label={`Delete ${name}`}
          title="Delete page"
          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function InlineName({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  return (
    <input
      autoFocus
      aria-label="Layer name"
      defaultValue={value}
      className="h-6 min-w-0 flex-1 rounded bg-surface px-1.5 text-[13px] text-foreground outline-none ring-1 ring-ring"
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}

/** The layer being dragged in the layers panel; a drag cannot be read back during dragover, so it lives here. */
let draggedLayerId: string | null = null

/** Which part of a row a pointer is over: the top edge, the bottom edge, or the middle. */
function dropZoneAt(event: { clientY: number; currentTarget: HTMLElement }, canHold: boolean): LayerDropZone {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  if (!canHold) return ratio < 0.5 ? 'before' : 'after'
  return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside'
}

function WebTreeNode({
  document,
  node,
  selectedId,
  depth = 0,
  onSelect,
  onToggleHidden,
  onRename,
  onMove,
}: {
  document: WebDocument
  node: WebNode
  selectedId: string | null
  depth?: number
  onSelect: (id: string) => void
  onToggleHidden: (id: string) => void
  onRename: (id: string, name: string) => void
  onMove: (id: string, targetId: string, zone: LayerDropZone) => void
}) {
  const children = layerChildren(document, node)
  const [dropZone, setDropZone] = useState<LayerDropZone | null>(null)
  // Collapsed until asked for, so a page of frames reads as a short list. A
  // selection made on the canvas opens just the path down to it.
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const isSelected = selectedId === node.id
  const holdsSelection = selectedId !== null && hasAncestor(document, selectedId, node.id)
  useEffect(() => {
    if (holdsSelection) setOpen(true)
  }, [holdsSelection])
  const hidden = node.kind === 'element' && node.styles.visibility === 'hidden'
  const label = nodeLabel(node, document)
  const renamable = node.kind === 'element'
  return (
    <div>
      <div
        className={cn(
          'group relative mx-1.5 my-0.5 flex h-7.5 cursor-pointer select-none items-center rounded-lg pe-2.5 text-xs transition-[background-color,color,box-shadow,opacity] duration-150 ease-smooth',
          isSelected
            ? 'bg-cx-accent/10 font-medium text-foreground ring-1 ring-inset ring-cx-accent/25'
            : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground',
          hidden && 'opacity-50',
          dropZone === 'inside' && 'bg-accent ring-1 ring-cx-accent',
        )}
        style={{ paddingInlineStart: 8 + depth * 16 }}
        draggable={!editing}
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => {
          if (renamable) setEditing(true)
        }}
        onDragStart={(event) => {
          draggedLayerId = node.id
          event.dataTransfer.effectAllowed = 'move'
          // Some engines refuse to start a drag that carries no data.
          event.dataTransfer.setData('text/plain', node.id)
        }}
        onDragEnd={() => {
          draggedLayerId = null
          setDropZone(null)
        }}
        onDragOver={(event) => {
          const dragged = draggedLayerId
          if (!dragged) return
          const zone = dropZoneAt(event, node.kind === 'element')
          // A drop that makes no sense (onto itself, into its own subtree) is not offered.
          if (!planLayerMove(document, dragged, node.id, zone)) {
            setDropZone(null)
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropZone(zone)
        }}
        onDragLeave={() => setDropZone(null)}
        onDrop={(event) => {
          const dragged = draggedLayerId
          if (!dragged) return
          event.preventDefault()
          event.stopPropagation()
          const zone = dropZoneAt(event, node.kind === 'element')
          draggedLayerId = null
          setDropZone(null)
          onMove(dragged, node.id, zone)
          if (zone === 'inside') setOpen(true)
        }}
      >
        {dropZone === 'before' ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-cx-accent" />
        ) : null}
        {dropZone === 'after' ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-cx-accent" />
        ) : null}
        <button
          type="button"
          className="grid size-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground disabled:pointer-events-none"
          aria-label={open ? 'Collapse element' : 'Expand element'}
          disabled={children.length === 0}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((value) => !value)
          }}
        >
          {children.length > 0 ? (
            open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />
          ) : null}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 ps-1">
          {nodeIcon(node)}
          {editing ? (
            <InlineName
              value={node.kind === 'element' ? (node.attributes[NAME_ATTRIBUTE] ?? label) : label}
              onCancel={() => setEditing(false)}
              onCommit={(value) => {
                setEditing(false)
                if (value.trim() !== label) onRename(node.id, value.trim())
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          )}
        </div>
        {node.kind === 'element' && !editing ? (
          <button
            type="button"
            aria-label={hidden ? 'Show element' : 'Hide element'}
            title={hidden ? 'Show element' : 'Hide element'}
            className={cn(
              'grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-opacity hover:text-foreground',
              hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleHidden(node.id)
            }}
          >
            {hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          </button>
        ) : null}
      </div>
      {open && children.length > 0
        ? children.map((child) => (
            <WebTreeNode
              key={child.id}
              document={document}
              node={child}
              selectedId={selectedId}
              depth={depth + 1}
              onSelect={onSelect}
              onToggleHidden={onToggleHidden}
              onRename={onRename}
              onMove={onMove}
            />
          ))
        : null}
    </div>
  )
}

function InspectorInput({
  label,
  value,
  placeholder,
  prefix,
  suffix,
  className,
  layout = 'row',
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  prefix?: ReactNode
  suffix?: ReactNode
  className?: string
  /** `row` puts the label beside the input, `stack` above it, `bare` hides it (aria-label only). */
  layout?: 'row' | 'stack' | 'bare'
  onCommit: (value: string) => void
}) {
  return (
    <label
      className={cn(
        'group min-w-0 text-xs text-muted-foreground',
        layout === 'stack' ? 'flex flex-col gap-1' : 'flex items-center gap-1.5',
        className,
      )}
    >
      {prefix || layout === 'bare' ? null : (
        <span
          className={cn(
            'truncate text-[11px] text-muted-foreground',
            layout === 'row' && 'w-20 shrink-0',
          )}
          title={label}
        >
          {label}
        </span>
      )}
      <div className="relative flex min-w-0 flex-1 items-center">
        {prefix ? (
          <span className="pointer-events-none absolute start-2.5 text-[13px] text-muted-foreground">{prefix}</span>
        ) : null}
        <input
          key={`${label}:${value}`}
          aria-label={label}
          defaultValue={value}
          placeholder={placeholder}
          className={cn(
            'h-8 w-full min-w-0 rounded-lg border border-transparent bg-well/60 px-2.5 text-[12px] font-mono tabular-nums text-foreground shadow-sunken outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-smooth placeholder:text-muted-foreground/60 hover:bg-well focus:border-cx-accent focus:bg-surface focus:ring-3 focus:ring-cx-accent/20',
            prefix ? 'ps-7' : null,
            suffix ? 'pe-7' : null,
          )}
          onBlur={(event) => {
            if (event.currentTarget.value !== value) onCommit(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute end-2.5 text-[11px] text-muted-foreground/70">{suffix}</span>
        ) : null}
      </div>
    </label>
  )
}

function InspectorSelect({
  label,
  value,
  options,
  placeholder = 'Default',
  layout = 'stack',
  onCommit,
}: {
  label: string
  value: string
  options: readonly (string | { value: string; label: string })[]
  placeholder?: string
  layout?: 'row' | 'stack'
  onCommit: (value: string) => void
}) {
  const normalized = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
  // A value authored outside the list (a raw CSS keyword, a stack) must stay visible and selectable.
  const listed = value && !normalized.some((option) => option.value === value)
    ? [{ value, label: value }, ...normalized]
    : normalized
  return (
    <label
      className={cn(
        'min-w-0 text-xs text-muted-foreground',
        layout === 'stack' ? 'flex flex-col gap-1' : 'flex items-center gap-1.5',
      )}
    >
      <span className={cn('truncate text-[11px]', layout === 'row' && 'w-20 shrink-0')} title={label}>{label}</span>
      <select
        aria-label={label}
        value={value}
        className="h-8 w-full min-w-0 rounded-lg border border-transparent bg-surface px-2 text-[12px] font-mono text-foreground shadow-raised outline-none transition-[border-color,box-shadow] duration-150 ease-smooth hover:shadow-raised-hover focus:border-cx-accent focus:ring-3 focus:ring-cx-accent/20"
        onChange={(event) => onCommit(event.currentTarget.value)}
      >
        <option value="">{placeholder}</option>
        {listed.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

const DISPLAY_OPTIONS = ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'] as const
const FLEX_DIRECTION_OPTIONS = ['row', 'row-reverse', 'column', 'column-reverse'] as const
const ALIGN_OPTIONS = ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] as const
const JUSTIFY_OPTIONS = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] as const
const POSITION_OPTIONS = ['static', 'relative', 'absolute', 'fixed', 'sticky'] as const
const OVERFLOW_OPTIONS = ['visible', 'hidden', 'scroll', 'auto'] as const
const FONT_WEIGHT_OPTIONS = [
  { value: '100', label: '100 · Thin' },
  { value: '200', label: '200 · Extra light' },
  { value: '300', label: '300 · Light' },
  { value: '400', label: '400 · Regular' },
  { value: '500', label: '500 · Medium' },
  { value: '600', label: '600 · Semibold' },
  { value: '700', label: '700 · Bold' },
  { value: '800', label: '800 · Extra bold' },
  { value: '900', label: '900 · Black' },
] as const
const TEXT_ALIGN_OPTIONS = ['left', 'center', 'right', 'justify'] as const
const FONT_STYLE_OPTIONS = ['normal', 'italic'] as const

/** A key on the zoom bar: 8px round inside the bar's 12px with 4px padding. */
const ZOOM_KEY =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-accent hover:text-foreground active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-ring'

function WebToolButton({
  label,
  active = false,
  disabled = false,
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  children: ReactNode
  onClick: () => void
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-cuelume-select=""
      className={cn(
        'relative grid size-8 place-items-center rounded-md outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-smooth active:scale-[0.92] active:duration-75 focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-cx-accent text-cx-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

export interface MatchingAuthoredRule {
  stylesheetId: string
  stylesheetName: string
  rule: WebStyleRule
  viaPseudoElement: boolean
}

export function matchingAuthoredRules(
  element: Element | null,
  document: WebDocument,
): MatchingAuthoredRule[] {
  if (!element) return []
  const grouped: MatchingAuthoredRule[] = []
  for (const sheetId of document.stylesheetOrder) {
    const sheet = document.stylesheets[sheetId]
    if (!sheet) continue
    for (const ruleId of sheet.ruleOrder) {
      const rule = sheet.rules[ruleId]
      if (!rule) continue
      try {
        if (element.matches(rule.selector)) {
          grouped.push({
            stylesheetId: sheet.id,
            stylesheetName: sheet.name,
            rule,
            viaPseudoElement: false,
          })
          continue
        }
      } catch {
        // Pseudo-element selector fallback
      }
      const base = rule.selector.replace(/::[a-z-]+(\(.*\))?$/i, '').trim()
      if (!base || base === rule.selector) continue
      try {
        if (element.matches(base)) {
          grouped.push({
            stylesheetId: sheet.id,
            stylesheetName: sheet.name,
            rule,
            viaPseudoElement: true,
          })
        }
      } catch {
        // Not matchable
      }
    }
  }
  return grouped
}

export interface BoundInspectorInfo {
  instanceId: string
  componentName: string
  isInstanceRoot: boolean
}

function WebInspector({
  node,
  geometry,
  computed,
  matchingRules,
  bound,
  override,
  pageBackground,
  boundedPage,
  pageSize,
  fonts,
  selectionColors,
  onReplaceColor,
  onSetPageBackground,
  onResizePage,
  onConnectAgent,
  onPatch,
  onPatchRule,
  onSetOverride,
  onClearOverride,
  onDeleteInstance,
}: {
  node: WebNode | null
  geometry: OverlayRect | null
  computed: Record<string, string>
  matchingRules: MatchingAuthoredRule[]
  bound: BoundInspectorInfo | null
  override: WebOverride | undefined
  pageBackground: string
  /** A named page has a size of its own; the open canvas does not. */
  boundedPage: boolean
  pageSize: { width: number; height: number }
  fonts: readonly DocumentFont[]
  selectionColors: readonly SelectionColor[]
  onReplaceColor: (from: string, to: string) => void
  onSetPageBackground: (color: string) => void
  onResizePage: (size: { width?: number; height?: number }) => void
  onConnectAgent: () => void
  onPatch: (patch: {
    tag?: string
    attributes?: Record<string, string | null>
    styles?: Record<string, string | null>
  }) => void
  onPatchRule: (stylesheetId: string, id: string, patch: WebRulePatch) => void
  onSetOverride: (override: WebOverride) => void
  onClearOverride: () => void
  onDeleteInstance: () => void
}) {
  const fillPickerRef = useRef<HTMLInputElement>(null)
  const pagePickerRef = useRef<HTMLInputElement>(null)
  // When no node is selected: Render Page & MCP sections (Image 2)
  if (!node) {
    return (
      <div>
        {/* Page Section */}
        <section className="space-y-2.5 border-b border-line px-4 pb-3.5 pt-3">
          <div className="flex h-6 items-center text-xs font-semibold text-foreground">
            Page
          </div>
          {boundedPage ? (
            <div className="grid grid-cols-2 gap-2">
              <InspectorInput label="Page width" layout="stack" value={String(pageSize.width)} onCommit={(value) => {
                const size = Number(value)
                if (Number.isFinite(size) && size > 0) onResizePage({ width: size })
              }} />
              <InspectorInput label="Page height" layout="stack" value={String(pageSize.height)} onCommit={(value) => {
                const size = Number(value)
                if (Number.isFinite(size) && size > 0) onResizePage({ height: size })
              }} />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 shadow-hairline p-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={pagePickerRef}
                type="color"
                aria-label="Page background color"
                className="size-6 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                value={pageBackground}
                onChange={(event) => onSetPageBackground(event.currentTarget.value)}
              />
              <span className="truncate font-mono text-xs uppercase text-foreground">{pageBackground.replace('#', '')}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onSetPageBackground(pageBackground === '#2a2a2a' ? '#181818' : '#2a2a2a')}
                title="Toggle canvas theme"
              >
                <LayoutGridIcon className="size-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => pagePickerRef.current?.click()}
                title="Edit color"
              >
                <PencilIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* MCP Section */}
        <section className="space-y-2 p-3">
          <div className="text-[13px] font-medium text-foreground">
            MCP
          </div>
          <Button
            variant="outline"
            className="w-full rounded-lg border-line bg-surface-2 hover:bg-secondary hover:text-foreground text-xs font-medium text-foreground py-2.5 flex items-center justify-center gap-2 shadow-xs transition-colors"
            onClick={onConnectAgent}
          >
            Connect your agent
          </Button>
        </section>
      </div>
    )
  }

  if (node.kind === 'text') {
    if (bound) {
      const text = override?.kind === 'text' ? override.text : node.text
      return (
        <div className="space-y-2 p-3">
          <div className="text-[13px] font-medium text-foreground">
            Instance override · text
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bound to {bound.componentName}; direct edits are rejected.
          </p>
          <InspectorInput
            label="text"
            value={text}
            onCommit={(value) => onSetOverride({ kind: 'text', text: value })}
          />
          {override ? (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={onClearOverride}>
              Clear override
            </Button>
          ) : null}
        </div>
      )
    }
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Text nodes are edited on the canvas. Select their parent element for CSS.
      </div>
    )
  }

  const attributeNames = ['id', 'class', 'aria-label']
  if (node.tag === 'a') attributeNames.push('href')
  if (node.tag === 'img') attributeNames.push('src', 'alt')
  const computedProperties = STYLE_GROUPS.flatMap((group) => group.properties)
  const customProperties = Object.entries(node.styles).filter(([name]) => name.startsWith('--'))

  const commitAttributeOverride = (change: Record<string, string | null>) => {
    const base = override?.kind === 'attributes' ? override.attributes : {}
    onSetOverride({ kind: 'attributes', attributes: { ...base, ...change } })
  }
  const commitCustomPropertyOverride = (change: Record<string, string | null>) => {
    const base = override?.kind === 'custom-properties' ? override.properties : {}
    onSetOverride({ kind: 'custom-properties', properties: { ...base, ...change } })
  }

  const shadows = readShadows(node.styles['box-shadow'])
  const isFlex = /^(inline-)?flex$/.test(node.styles.display ?? computed.display ?? '')
  const flexColumn = (node.styles['flex-direction'] ?? computed['flex-direction'] ?? 'row').startsWith('column')
  const icon = iconInfo(node)
  const iconColor = node.styles.color ?? ''
  const iconSize = parseInt(node.styles.width ?? '', 10)
  const iconStroke = node.attributes['stroke-width'] ?? ''
  const styleIcon = (style: { color?: string; size?: number; strokeWidth?: number }) => {
    const operation = iconStyleOperation(node.id, style)
    if (operation?.type === 'node.patch' && operation.patch.kind === 'element') {
      onPatch({ styles: operation.patch.styles, attributes: operation.patch.attributes })
    }
  }

  const shader = shaderInfo(node)
  const styleShader = (change: { params?: Record<string, string | number | string[]> }) => {
    const operation = shaderPatchOperation(node, change)
    if (operation?.type === 'node.patch' && operation.patch.kind === 'element') {
      onPatch({ styles: operation.patch.styles, attributes: operation.patch.attributes })
    }
  }

  return (
    <div>
      {shader && !bound ? (
        <section className="space-y-3 border-b border-line px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-foreground">
            <span>Shader</span>
            <span className="min-w-0 truncate font-mono text-[10px] lowercase">{shader.name}</span>
          </div>
          <InspectorInput
            label="Colors"
            layout="stack"
            value={Array.isArray(shader.params.colors) ? shader.params.colors.join(', ') : ''}
            placeholder="#111111, #ff00aa"
            onCommit={(val) => {
              const colors = val.split(',').map((color) => color.trim()).filter(Boolean)
              if (colors.length) styleShader({ params: { colors } })
            }}
          />
          <InspectorInput
            label="Speed"
            layout="stack"
            value={String(shader.params.speed ?? '')}
            onCommit={(val) => {
              const speed = Number(val)
              if (val.trim() !== '' && Number.isFinite(speed)) styleShader({ params: { speed } })
            }}
          />
        </section>
      ) : null}
      {icon && !bound ? (
        <section className="space-y-3 border-b border-line px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-foreground">
            <span>Icon</span>
            <span className="min-w-0 truncate font-mono text-[10px] lowercase" title={`${icon.name} · ${icon.library}`}>
              {icon.name} · {icon.library}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Icon color picker"
              className="size-7 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0 shadow-xs"
              value={/^#[\da-f]{6}$/i.test(iconColor) ? iconColor : '#000000'}
              onChange={(event) => styleIcon({ color: event.currentTarget.value })}
            />
            <div className="min-w-0 flex-1">
              <InspectorInput
                label="Icon color"
                layout="bare"
                value={iconColor}
                placeholder="currentColor"
                onCommit={(val) => onPatch({ styles: { color: val ? val : null } })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <InspectorInput
              label="Icon size"
              layout="stack"
              value={Number.isFinite(iconSize) ? String(iconSize) : ''}
              placeholder="24"
              suffix="px"
              onCommit={(val) => {
                const size = Number(val)
                if (Number.isFinite(size) && size > 0) styleIcon({ size })
              }}
            />
            <InspectorInput
              label="Stroke width"
              layout="stack"
              value={iconStroke}
              placeholder="1.5"
              onCommit={(val) => {
                const width = Number(val)
                if (Number.isFinite(width) && width > 0) styleIcon({ strokeWidth: width })
              }}
            />
          </div>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.25}
            aria-label="Stroke weight"
            value={Number(iconStroke) || 1.5}
            onChange={(event) => styleIcon({ strokeWidth: Number(event.currentTarget.value) })}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-surface-2 accent-primary"
          />
        </section>
      ) : null}

      <InspectorSection
        title="Layout"
        collapsible
        action={<span className="font-mono text-[10px] lowercase text-muted-foreground">&lt;{node.tag}&gt;</span>}
      >
        {bound ? (
          <div className="space-y-1.5 rounded-lg bg-surface-2 p-2.5 text-xs">
            <div className="font-mono text-[11px] text-foreground">&lt;{node.tag}&gt;</div>
            <p className="text-[11px] text-muted-foreground">
              Instance of {bound.componentName}; structure comes from template.
            </p>
            {bound.isInstanceRoot ? (
              <Button size="sm" variant="outline" className="w-full text-xs border-line" onClick={onDeleteInstance}>
                Delete instance
              </Button>
            ) : null}
          </div>
        ) : (
          <InspectorInput label="tag" value={node.tag} onCommit={(tag) => onPatch({ tag })} />
        )}

        <div className="grid grid-cols-2 gap-2">
          <InspectorInput
            label="left"
            prefix="X"
            value={node.styles.left ?? (geometry ? `${Math.round(geometry.left)}px` : '')}
            placeholder={geometry ? `${Math.round(geometry.left)}px` : '0'}
            onCommit={(val) => onPatch({ styles: { left: val ? val : null } })}
          />
          <InspectorInput
            label="top"
            prefix="Y"
            value={node.styles.top ?? (geometry ? `${Math.round(geometry.top)}px` : '')}
            placeholder={geometry ? `${Math.round(geometry.top)}px` : '0'}
            onCommit={(val) => onPatch({ styles: { top: val ? val : null } })}
          />
          <InspectorInput
            label="width"
            prefix="W"
            value={node.styles.width ?? (geometry ? `${Math.round(geometry.width)}px` : '')}
            placeholder={geometry ? `${Math.round(geometry.width)}px` : 'auto'}
            onCommit={(val) => onPatch({ styles: { width: val ? val : null } })}
          />
          <InspectorInput
            label="height"
            prefix="H"
            value={node.styles.height ?? (geometry ? `${Math.round(geometry.height)}px` : '')}
            placeholder={geometry ? `${Math.round(geometry.height)}px` : 'auto'}
            onCommit={(val) => onPatch({ styles: { height: val ? val : null } })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InspectorSelect
            label="display"
            value={node.styles.display ?? ''}
            options={DISPLAY_OPTIONS}
            placeholder={computed.display || 'Default'}
            onCommit={(val) => onPatch({ styles: { display: val ? val : null } })}
          />
          <InspectorSelect
            label="position"
            value={node.styles.position ?? ''}
            options={POSITION_OPTIONS}
            placeholder={computed.position || 'Default'}
            onCommit={(val) => onPatch({ styles: { position: val ? val : null } })}
          />
        </div>
      </InspectorSection>

      {isFlex ? (
        <InspectorSection
          title="Flex"
          collapsible
          action={
            <button
              type="button"
              aria-label="Remove flex"
              title="Remove flex"
              className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => onPatch({ styles: { display: null, 'flex-direction': null, 'align-items': null, 'justify-content': null, 'flex-wrap': null, gap: null } })}
            >
              <span className="h-px w-3 bg-current" />
            </button>
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
            <AlignmentGrid
              direction={flexColumn ? 'column' : 'row'}
              justify={node.styles['justify-content'] || 'flex-start'}
              align={node.styles['align-items'] || 'flex-start'}
              onChange={({ justify, align }) => onPatch({ styles: { display: node.styles.display || 'flex', 'justify-content': justify, 'align-items': align } })}
            />
            <div className="min-w-0 space-y-2">
              <IconToggle
                label="Direction"
                value={flexColumn ? 'column' : 'row'}
                options={[
                  { value: 'column', label: 'Direction column', icon: <span aria-hidden className="text-sm leading-none">↓</span> },
                  { value: 'row', label: 'Direction row', icon: <span aria-hidden className="text-sm leading-none">→</span> },
                ]}
                onChange={(value) => onPatch({ styles: { 'flex-direction': value } })}
              />
              <IconToggle
                label="Wrap"
                value={node.styles['flex-wrap'] === 'wrap' ? 'wrap' : 'nowrap'}
                options={[
                  { value: 'nowrap', label: 'No wrap', icon: <span aria-hidden className="text-sm leading-none">–</span> },
                  { value: 'wrap', label: 'Wrap', icon: <span aria-hidden className="text-sm leading-none">↩</span> },
                ]}
                onChange={(value) => onPatch({ styles: { 'flex-wrap': value === 'wrap' ? 'wrap' : null } })}
              />
              <InspectorInput
                label="gap"
                layout="bare"
                prefix="↕"
                value={node.styles.gap ?? ''}
                placeholder="0"
                onCommit={(val) => onPatch({ styles: { gap: val ? val : null } })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InspectorInput
              label="padding-x"
              layout="bare"
              prefix="⇹"
              value={node.styles['padding-inline'] ?? ''}
              placeholder="0"
              onCommit={(val) => onPatch({ styles: { 'padding-inline': val ? val : null } })}
            />
            <InspectorInput
              label="padding-y"
              layout="bare"
              prefix="⇳"
              value={node.styles['padding-block'] ?? ''}
              placeholder="0"
              onCommit={(val) => onPatch({ styles: { 'padding-block': val ? val : null } })}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={(node.styles.overflow ?? '') === 'hidden'}
              onChange={(event) => onPatch({ styles: { overflow: event.currentTarget.checked ? 'hidden' : null } })}
            />
            Clip content
          </label>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">CSS values</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <InspectorSelect
                label="flex-direction"
                value={node.styles['flex-direction'] ?? ''}
                options={FLEX_DIRECTION_OPTIONS}
                placeholder="row"
                onCommit={(val) => onPatch({ styles: { 'flex-direction': val ? val : null } })}
              />
              <InspectorSelect
                label="align-items"
                value={node.styles['align-items'] ?? ''}
                options={ALIGN_OPTIONS}
                onCommit={(val) => onPatch({ styles: { 'align-items': val ? val : null } })}
              />
              <InspectorSelect
                label="justify-content"
                value={node.styles['justify-content'] ?? ''}
                options={JUSTIFY_OPTIONS}
                onCommit={(val) => onPatch({ styles: { 'justify-content': val ? val : null } })}
              />
              <InspectorSelect
                label="overflow"
                value={node.styles.overflow ?? ''}
                options={OVERFLOW_OPTIONS}
                placeholder={computed.overflow || 'Default'}
                onCommit={(val) => onPatch({ styles: { overflow: val ? val : null } })}
              />
            </div>
          </details>
        </InspectorSection>
      ) : (
        <OptionalSection
          title="Flex"
          active={false}
          onAdd={() => onPatch({
            styles: {
              display: 'flex',
              'flex-direction': node.styles['flex-direction'] || 'column',
              gap: node.styles.gap || '12px',
            },
          })}
          onRemove={() => undefined}
        >
          {null}
        </OptionalSection>
      )}

      <InspectorSection title="Radius" action={<SquareIcon className="size-3.5" />}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={64}
            value={parseInt(node.styles['border-radius'] ?? '0', 10) || 0}
            onChange={(e) => onPatch({ styles: { 'border-radius': `${e.target.value}px` } })}
            aria-label="Border radius"
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-primary"
          />
          <div className="w-20 shrink-0">
            <InspectorInput
              label="border-radius"
              layout="bare"
              value={node.styles['border-radius'] ?? '0'}
              placeholder="0"
              onCommit={(val) => onPatch({ styles: { 'border-radius': val ? val : null } })}
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        title="Blending"
        action={
          <button
            type="button"
            aria-label={node.styles.opacity === '0' ? 'Show element' : 'Hide element'}
            className="grid size-5 place-items-center rounded hover:text-foreground"
            onClick={() => onPatch({ styles: { opacity: node.styles.opacity === '0' ? '1' : '0' } })}
          >
            {node.styles.opacity === '0' ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
          <InspectorInput
            label="opacity"
            layout="bare"
            value={node.styles.opacity ?? '1'}
            placeholder="1"
            onCommit={(val) => onPatch({ styles: { opacity: val ? val : null } })}
          />
          <select
            aria-label="Blend mode"
            value={node.styles['mix-blend-mode'] ?? 'normal'}
            onChange={(e) => onPatch({ styles: { 'mix-blend-mode': e.target.value === 'normal' ? null : e.target.value } })}
            className="h-8 w-full min-w-0 rounded-lg border border-transparent bg-surface-2 px-2 text-[13px] text-foreground outline-none hover:border-line focus:border-ring"
          >
            {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference'].map((mode) => (
              <option key={mode} value={mode}>{mode.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash ? ' ' : ''}${letter.toUpperCase()}`)}</option>
            ))}
          </select>
        </div>
      </InspectorSection>

      <InspectorSection
        title="Fill"
        action={
          <button
            type="button"
            aria-label="Choose fill color"
            className="grid size-5 place-items-center rounded hover:text-foreground"
            onClick={() => fillPickerRef.current?.click()}
          >
            <PlusIcon className="size-4" />
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <input
            ref={fillPickerRef}
            type="color"
            aria-label="Fill color"
            className="size-8 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
            value={toColorInputValue(node.styles.background || node.styles['background-color'] || '')}
            onChange={(event) => onPatch({ styles: { background: event.currentTarget.value } })}
          />
          <div className="min-w-0 flex-1">
            <InspectorInput
              label="background"
              layout="bare"
              value={node.styles.background || node.styles['background-color'] || ''}
              placeholder="#ffffff"
              onCommit={(val) => onPatch({ styles: { background: val ? val : null } })}
            />
          </div>
        </div>
      </InspectorSection>

      <OptionalSection
        title="Outline"
        active={Boolean(node.styles.outline)}
        onAdd={() => onPatch({ styles: { outline: '2px solid #3b82f6', 'outline-offset': '2px' } })}
        onRemove={() => onPatch({ styles: { outline: null, 'outline-offset': null } })}
      >
        <InspectorInput
          label="outline"
          layout="bare"
          value={node.styles.outline ?? ''}
          placeholder="2px solid #3b82f6"
          onCommit={(val) => onPatch({ styles: { outline: val ? val : null } })}
        />
      </OptionalSection>

      <OptionalSection
        title="Border"
        active={Boolean(node.styles.border)}
        onAdd={() => onPatch({ styles: { border: '1px solid #3e3e3e' } })}
        onRemove={() => onPatch({ styles: { border: null, 'border-width': null } })}
      >
        <div className="flex items-center gap-2">
          <div className="w-20 shrink-0">
            <InspectorInput
              label="border-width"
              layout="bare"
              value={node.styles['border-width'] ?? (node.styles.border ? '1px' : '')}
              placeholder="1px"
              onCommit={(val) => onPatch({ styles: { 'border-width': val ? val : null } })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <InspectorInput
              label="border"
              layout="bare"
              value={node.styles.border ?? ''}
              placeholder="1px solid #333"
              onCommit={(val) => onPatch({ styles: { border: val ? val : null } })}
            />
          </div>
        </div>
      </OptionalSection>

      <OptionalSection
        title="Shadow"
        active={Boolean(shadows.outer)}
        onAdd={() => onPatch({ styles: { 'box-shadow': writeShadows('0 4px 12px rgba(0, 0, 0, 0.25)', shadows.inner) } })}
        onRemove={() => onPatch({ styles: { 'box-shadow': writeShadows('', shadows.inner) } })}
      >
        <InspectorInput
          label="shadow"
          layout="bare"
          value={shadows.outer}
          placeholder="0 4px 12px rgba(0, 0, 0, 0.25)"
          onCommit={(val) => onPatch({ styles: { 'box-shadow': writeShadows(val, shadows.inner) } })}
        />
      </OptionalSection>

      <OptionalSection
        title="Inner shadow"
        active={Boolean(shadows.inner)}
        onAdd={() => onPatch({ styles: { 'box-shadow': writeShadows(shadows.outer, '0 2px 6px rgba(0, 0, 0, 0.3)') } })}
        onRemove={() => onPatch({ styles: { 'box-shadow': writeShadows(shadows.outer, '') } })}
      >
        <InspectorInput
          label="inner shadow"
          layout="bare"
          value={shadows.inner}
          placeholder="0 2px 6px rgba(0, 0, 0, 0.3)"
          onCommit={(val) => onPatch({ styles: { 'box-shadow': writeShadows(shadows.outer, val) } })}
        />
      </OptionalSection>

      <OptionalSection
        title="Filters"
        active={Boolean(node.styles.filter)}
        onAdd={() => onPatch({ styles: { filter: 'blur(4px)' } })}
        onRemove={() => onPatch({ styles: { filter: null } })}
      >
        <InspectorInput
          label="filter"
          layout="bare"
          value={node.styles.filter ?? ''}
          placeholder="blur(4px)"
          onCommit={(val) => onPatch({ styles: { filter: val ? val : null } })}
        />
      </OptionalSection>

      {selectionColors.length > 0 ? (
        <InspectorSection title="Selection colors">
          <div className="space-y-2">
            {selectionColors.map(({ color, count }) => (
              <div key={color} className="flex items-center gap-2">
                <label className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-1.5 text-[13px] text-foreground">
                  <span className="relative size-5 shrink-0 overflow-hidden rounded-md border border-line" style={{ background: color }}>
                    <input
                      type="color"
                      aria-label={`Replace ${color}`}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      value={toColorInputValue(color)}
                      onChange={(event) => onReplaceColor(color, event.currentTarget.value)}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase">{color.replace(/^#/, '')}</span>
                </label>
                <span className="w-6 shrink-0 text-end text-xs text-muted-foreground" title={`Used ${count} time${count === 1 ? '' : 's'}`}>{count}</span>
              </div>
            ))}
          </div>
        </InspectorSection>
      ) : null}

      {/* Typography Section (Image 4 & tests) */}
      <section className="space-y-3 border-b border-line px-4 py-3.5">
        <div className="flex h-5 items-center justify-between text-[13px] font-medium text-foreground">
          <span>Typography</span>
        </div>
        <div className="space-y-1.5">
          <InspectorInput
            label="color"
            value={node.styles.color ?? ''}
            placeholder="rgb(20, 20, 24)"
            onCommit={(val) => onPatch({ styles: { color: val ? val : null } })}
          />
          <InspectorSelect
            label="font-family"
            layout="row"
            value={node.styles['font-family'] ?? ''}
            placeholder={firstFamily(computed['font-family'] ?? '') || 'Default'}
            options={[
              ...fonts.map((font) => ({ value: font.stack, label: font.family })),
              ...SYSTEM_FONT_STACKS.filter((system) => !fonts.some((font) => font.stack === system.stack)).map(
                (system) => ({ value: system.stack, label: system.label }),
              ),
            ]}
            onCommit={(val) => onPatch({ styles: { 'font-family': val ? val : null } })}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <InspectorInput
              label="font-size"
              layout="stack"
              value={node.styles['font-size'] ?? ''}
              placeholder="14px"
              onCommit={(val) => onPatch({ styles: { 'font-size': val ? val : null } })}
            />
            <InspectorSelect
              label="font-weight"
              value={node.styles['font-weight'] ?? ''}
              options={FONT_WEIGHT_OPTIONS}
              placeholder={computed['font-weight'] || 'Default'}
              onCommit={(val) => onPatch({ styles: { 'font-weight': val ? val : null } })}
            />
            <InspectorSelect
              label="text-align"
              value={node.styles['text-align'] ?? ''}
              options={TEXT_ALIGN_OPTIONS}
              onCommit={(val) => onPatch({ styles: { 'text-align': val ? val : null } })}
            />
            <InspectorSelect
              label="font-style"
              value={node.styles['font-style'] ?? ''}
              options={FONT_STYLE_OPTIONS}
              onCommit={(val) => onPatch({ styles: { 'font-style': val ? val : null } })}
            />
          </div>
          <InspectorInput
            label="line-height"
            value={node.styles['line-height'] ?? ''}
            placeholder="1.5"
            onCommit={(val) => onPatch({ styles: { 'line-height': val ? val : null } })}
          />
        </div>
      </section>

      {/* Attributes Section (for tests and editing) */}
      <section className="space-y-3 border-b border-line px-4 py-3.5">
        <div className="text-[13px] font-medium text-foreground">
          {bound ? 'Instance override · attributes' : 'Attributes'}
        </div>
        {attributeNames.map((name) => (
          <InspectorInput
            key={name}
            label={name}
            value={node.attributes[name] ?? ''}
            onCommit={(value) => {
              const change = { [name]: value.trim() ? value : null }
              if (bound) commitAttributeOverride(change)
              else onPatch({ attributes: change })
            }}
          />
        ))}
        {bound && override?.kind === 'attributes' ? (
          <Button size="sm" variant="outline" className="w-full text-xs border-line" onClick={onClearOverride}>
            Clear override
          </Button>
        ) : null}
      </section>

      {/* Custom Properties (for instances or variables) */}
      {bound && (
        <section className="space-y-3 border-b border-line px-4 py-3.5">
          <div className="text-[13px] font-medium text-foreground">
            Instance override · custom properties
          </div>
          {customProperties.map(([name, value]) => (
            <InspectorInput
              key={name}
              label={name}
              value={value}
              onCommit={(next) =>
                commitCustomPropertyOverride({ [name]: next.trim() ? next : null })
              }
            />
          ))}
          {override?.kind === 'custom-properties' ? (
            <Button size="sm" variant="outline" className="w-full text-xs border-line" onClick={onClearOverride}>
              Clear override
            </Button>
          ) : null}
        </section>
      )}

      {/* Authored · matching stylesheet rules */}
      <section className="space-y-3 border-b border-line p-3">
        <div className="text-[13px] font-medium text-foreground">
          Authored · matching stylesheet rules
        </div>
        {matchingRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No stylesheet rule matches this element. Rules match in the browser.
          </p>
        ) : (
          matchingRules.map(({ stylesheetId, stylesheetName, rule, viaPseudoElement }) => (
            <div key={rule.id} className="space-y-2 rounded-lg bg-surface-2 shadow-hairline p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-well px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {stylesheetName}
                </span>
                {rule.conditions.map((condition, index) => (
                  <span
                    key={`${condition.kind}:${index}`}
                    className="rounded bg-well px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    @{condition.kind} {condition.query}
                  </span>
                ))}
                {viaPseudoElement ? (
                  <span className="rounded bg-well px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    pseudo-element · stays CSS
                  </span>
                ) : null}
              </div>
              <InspectorInput
                label="selector"
                value={rule.selector}
                onCommit={(selector) => {
                  if (selector.trim()) onPatchRule(stylesheetId, rule.id, { selector })
                }}
              />
              {Object.entries(rule.declarations).map(([name, value]) => (
                <InspectorInput
                  key={name}
                  label={name}
                  value={value}
                  onCommit={(next) =>
                    onPatchRule(stylesheetId, rule.id, {
                      declarations: { [name]: next.trim() ? next : null },
                    })
                  }
                />
              ))}
            </div>
          ))
        )}
      </section>

      {/* Computed · browser output · read-only */}
      <section className="space-y-2 p-3">
        <div className="text-[13px] font-medium text-foreground">
          Computed · browser output · read-only
        </div>
        <p className="text-[10px] text-muted-foreground">
          Resolved by the browser from inline style, sheets, and viewport.
        </p>
        {computedProperties.map((property) => (
          <div
            key={property}
            className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs"
          >
            <span className="truncate text-muted-foreground text-[11px]">{property}</span>
            <span className="min-w-0 truncate font-mono text-[11px] text-foreground">
              {computed[property] || '—'}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

const CANVAS_BG_PATTERN = /^#[\da-f]{6}$/i

export function WebCanvasEditor({
  designId,
  draftId = null,
  initialDocument,
  initialRevision,
  name,
}: {
  designId: string
  draftId?: string | null
  initialDocument: WebDocument
  initialRevision: number
  name: string
}) {
  // Opening a file puts it in the sidebar's open list; the name stays live.
  const slots = useChromeSlots()
  const [document, setDocument] = useState(initialDocument)
  const [activePageId, setActivePageId] = useState<string | null>(() => openingPageId(initialDocument))
  const pageId = resolvePageId(document, activePageId)
  const pageIdRef = useRef(pageId)
  pageIdRef.current = pageId
  const [selectedId, setSelectedId] = useState<string | null>(
    () => pageLayerIds(initialDocument, openingPageId(initialDocument))[0] ?? null,
  )
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [agentActivity, setAgentActivity] = useState<AgentActivity | null>(null)
  useRegisterOpenTab({ id: designId, name: document.name || name || 'Untitled' })
  const [selectionRect, setSelectionRect] = useState<OverlayRect | null>(null)
  const [hoverRect, setHoverRect] = useState<OverlayRect | null>(null)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const [computed, setComputed] = useState<Record<string, string>>({})
  const [camera, setCamera] = useState<Camera>({ x: 320, y: 120, zoom: 0.75 })
  const [tool, setToolState] = useState<'select' | 'pan' | 'frame' | 'box' | 'pen' | 'text' | 'image' | 'comment'>('select')
  const [pageSelected, setPageSelected] = useState(false)
  // The colour behind a page's frames lives in the document, so exports, undo and
  // agents all see it.
  const canvasBg = stageColor(document, pageId)
  const penDraftRef = useRef<{ pathId: string; points: { x: number; y: number }[] } | null>(null)
  const setTool = useCallback((next: typeof tool) => {
    penDraftRef.current = null
    setToolState(next)
  }, [])
  const [isSpacePanning, setIsSpacePanning] = useState(false)
  const [quickInsertOpen, setQuickInsertOpen] = useState(false)
  const [connectAgentOpen, setConnectAgentOpen] = useState(false)
  const [shadersOpen, setShadersOpen] = useState(false)
  // Draw the shader gallery's pictures in the background once the editor has settled,
  // one at a time, so the gallery is ready by the time anyone opens it.
  useEffect(() => {
    const timer = window.setTimeout(prewarmShaderThumbnails, 2_500)
    return () => window.clearTimeout(timer)
  }, [])
  const [pagesOpen, setPagesOpen] = useState(true)
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isCompact = windowWidth < 1024

  const [leftPanelOpen, setLeftPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)
  // Closed until something on the canvas is chosen; `select` opens it.
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const preFocusRef = useRef({ left: true, right: false })
  const toggleFocusMode = useCallback(() => {
    setFocusMode((curr) => {
      if (!curr) {
        preFocusRef.current = { left: leftPanelOpen, right: rightPanelOpen }
        setLeftPanelOpen(false)
        setRightPanelOpen(false)
        return true
      } else {
        setLeftPanelOpen(preFocusRef.current.left)
        setRightPanelOpen(preFocusRef.current.right)
        return false
      }
    })
  }, [leftPanelOpen, rightPanelOpen])

  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  // Left: the file's structure, what can be placed, its tokens. Right: the
  // selection, and the conversation about it.
  const [leftTab, setLeftTab] = useState<'design' | 'assets' | 'theme'>('design')
  const [assetsKind, setAssetsKind] = useState<'images' | 'icons'>('images')
  const [rightTab, setRightTab] = useState<'design' | 'comments'>('design')
  const [leftWidth, setLeftWidth] = usePanelWidth('sheet:panel-left', 256)
  const [rightWidth, setRightWidth] = usePanelWidth('sheet:panel-right', 288)
  const { comments, create: createComment, resolve: resolveComment, remove: removeComment } = useDesignComments(designId)
  const [threadNodeId, setThreadNodeId] = useState<string | null>(null)
  const [pinRects, setPinRects] = useState<Record<string, OverlayRect>>({})
  const pinIdsRef = useRef<string[]>([])
  // Top-level frames wear a name label on the canvas; double-click it to rename.
  const [frameRects, setFrameRects] = useState<Record<string, OverlayRect>>({})
  const frameIdsRef = useRef<string[]>([])
  const [renamingFrameId, setRenamingFrameId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [notice, setNotice] = useState<string | null>(null)
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(loadCachedShortcuts)
  const [history, setHistory] = useState<WebTransaction[]>([])
  const [redo, setRedo] = useState<WebTransaction[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const pageBoundsRef = useRef<HTMLDivElement | null>(null)
  const documentRef = useRef(document)
  const revisionRef = useRef(initialRevision)
  const selectedRef = useRef(selectedId)
  const hoveredRef = useRef(hoveredId)
  const cameraRef = useRef(camera)
  const savingRef = useRef(false)
  const staleRef = useRef(false)
  const syncLatestRef = useRef<() => void>(() => {})
  const pendingSavesRef = useRef<{ transaction: WebTransaction; snapshot: WebDocument }[]>([])
  const dragRef = useRef<DragState | null>(null)
  const drawingRef = useRef<DrawingDraft | null>(null)
  const [drawing, setDrawing] = useState<DrawingDraft | null>(null)
  const [pageResizePreview, setPageResizePreview] = useState<{ width: number; height: number } | null>(null)
  const suppressClickRef = useRef(false)

  const findElement = useCallback((id: string | null) => {
    if (!id || !hostRef.current) return null
    const safe = id.replace(/["\\]/g, '\\$&')
    return hostRef.current.querySelector<HTMLElement | SVGElement>(
      `[data-sheet-node="${safe}"]`,
    )
  }, [])

  const measure = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const host = hostRef.current
    if (host) {
      const { scrollWidth: width, scrollHeight: height } = host
      setContentSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    const stageRect = stage.getBoundingClientRect()
    const rectFor = (id: string | null): OverlayRect | null => {
      const element = findElement(id)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        width: rect.width,
        height: rect.height,
      }
    }
    setSelectionRect(keepRect(rectFor(selectedRef.current)))
    setHoverRect(keepRect(rectFor(hoveredRef.current)))
    const nextPins: Record<string, OverlayRect> = {}
    for (const id of pinIdsRef.current) {
      const rect = rectFor(id)
      if (rect) nextPins[id] = rect
    }
    setPinRects(keepRects(nextPins))
    const nextFrames: Record<string, OverlayRect> = {}
    for (const id of frameIdsRef.current) {
      const rect = rectFor(id)
      if (rect) nextFrames[id] = rect
    }
    setFrameRects(keepRects(nextFrames))
    const selected = findElement(selectedRef.current)
    if (!selected) {
      setComputed(keepRecord({}))
      return
    }
    const style = getComputedStyle(selected)
    setComputed(keepRecord(Object.fromEntries(
      STYLE_GROUPS.flatMap((group) => group.properties).map((property) => [
        property,
        style.getPropertyValue(property),
      ]),
    )))
  }, [findElement])

  // One measure pass per frame, however many wheel/pointer events landed in it.
  // The camera state commits in the same callback so React renders once.
  const measureFrameRef = useRef<number | null>(null)
  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return
    measureFrameRef.current = requestAnimationFrame(() => {
      measureFrameRef.current = null
      setCamera(cameraRef.current)
      measure()
    })
  }, [measure])

  // Pins sit on every element that has an open comment, plus the one whose thread is open.
  const openCommentNodeIds = useMemo(
    () => [...new Set(comments.filter((comment) => !comment.resolved).map((comment) => comment.nodeId))],
    [comments],
  )
  const agentNodeIds = useMemo(() => agentActivity?.nodeIds.slice(0, 8) ?? [], [agentActivity])
  useEffect(() => {
    const ids = new Set([...openCommentNodeIds, ...agentNodeIds])
    if (threadNodeId) ids.add(threadNodeId)
    pinIdsRef.current = [...ids]
    scheduleMeasure()
  }, [openCommentNodeIds, agentNodeIds, threadNodeId, scheduleMeasure])

  // The indicator clears itself when the server's window for it runs out, and a
  // finished run is marked with one quiet cue.
  useEffect(() => {
    if (!agentActivity) return
    const wait = Math.max(0, agentActivity.expiresAt - Date.now())
    const timer = window.setTimeout(
      () => setAgentActivity((current) => (current?.id === agentActivity.id && current.phase === agentActivity.phase ? null : current)),
      wait,
    )
    return () => window.clearTimeout(timer)
  }, [agentActivity])
  const agentWasWorkingRef = useRef(false)
  useEffect(() => {
    const phase = agentActivity?.phase
    if (agentWasWorkingRef.current && phase === 'settled') Sound.ready()
    agentWasWorkingRef.current = phase === 'working'
  }, [agentActivity?.phase])

  const onMaterialize = useCallback((element: HTMLDivElement) => {
    hostRef.current = element
    scheduleMeasure()
  }, [scheduleMeasure])

  useEffect(() => {
    let active = true
    if (typeof orpc.preferences?.get === 'function') {
      void orpc.preferences.get().then((preferences) => {
        if (active) setShortcutConfig(normalizeConfig(preferences.shortcuts))
      }).catch(() => undefined)
    }
    const sync = () => {
      if (pendingSavesRef.current.length > 0) {
        // Local edits are mid-flight; resync as soon as they land.
        staleRef.current = true
        return
      }
      staleRef.current = false
      void orpc.webCanvas.get({
        designId,
        ...(draftId ? { draftId } : {}),
      }).then((latest) => {
        if (!active || latest.status !== 'ready' || latest.revision <= revisionRef.current) return
        revisionRef.current = latest.revision
        documentRef.current = latest.document
        setDocument(latest.document)
        setHistory([])
        setRedo([])
        const selected = selectedRef.current
        if (selected && !latest.document.nodes[selected]) {
          selectedRef.current = pageLayerIds(latest.document, resolvePageId(latest.document, pageIdRef.current))[0] ?? null
          setSelectedId(selectedRef.current)
        }
        setSaveStatus('saved')
        scheduleMeasure()
      }).catch(() => undefined)
    }
    syncLatestRef.current = sync
    // Any announcement triggers a sync (the revision check happens on the
    // fetched result), and every (re)connect resyncs what a dropped stream missed.
    const stop = subscribeCanvasChanges(designId, sync, { draftId, onReady: sync, onAgentActivity: setAgentActivity })
    return () => {
      active = false
      stop()
    }
  }, [designId, draftId, scheduleMeasure])

  const select = useCallback((id: string | null) => {
    selectedRef.current = id
    setSelectedId(id)
    setPageSelected(false)
    if (id) {
      setRightPanelOpen(true)
    }
    scheduleMeasure()
  }, [scheduleMeasure])

  const hover = useCallback((id: string | null) => {
    hoveredRef.current = id
    setHoveredId(id)
    scheduleMeasure()
  }, [scheduleMeasure])

  const flushSaves = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaveStatus('saving')
    while (pendingSavesRef.current.length > 0) {
      const pending = pendingSavesRef.current[0]
      if (!pending) break
      try {
        const saved = await orpc.webCanvas.applyTransaction({
          designId,
          ...(draftId ? { draftId } : {}),
          expectedRevision: revisionRef.current,
          transaction: pending.transaction,
        })
        revisionRef.current = saved.revision
        pendingSavesRef.current.shift()
        if (pendingSavesRef.current.length === 0 && documentRef.current === pending.snapshot) {
          documentRef.current = saved.document
          setDocument(saved.document)
        }
      } catch (error) {
        setNotice(`Save failed. Edits remain in this window; keep it open and retry. ${error instanceof Error ? error.message : ''}`)
        setSaveStatus('error')
        savingRef.current = false
        return
      }
    }
    savingRef.current = false
    setSaveStatus('saved')
    scheduleMeasure()
    if (staleRef.current) syncLatestRef.current()
  }, [designId, draftId, scheduleMeasure])

  const saveTransaction = useCallback((
    transaction: WebTransaction,
    options: { recordHistory?: boolean } = {},
  ) => {
    let local: ReturnType<typeof applyWebTransaction>
    try {
      local = applyWebTransaction(documentRef.current, transaction)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transaction is invalid')
      setSaveStatus('error')
      scheduleMeasure()
      return false
    }
    documentRef.current = local.document
    setDocument(local.document)
    scheduleMeasure()
    if (options.recordHistory !== false) {
      setHistory((current) => [...current, local.inverse])
      setRedo([])
    }
    pendingSavesRef.current.push({ transaction, snapshot: local.document })
    if (pendingSavesRef.current.length === 1 && !savingRef.current) {
      setNotice(null)
      void flushSaves()
    }
    return true
  }, [flushSaves, scheduleMeasure])

  const transact = useCallback((label: string, operations: WebTransaction['operations']) => {
    void saveTransaction({ id: webId('webtx'), label, operations })
  }, [saveTransaction])

  const patchRule = useCallback((stylesheetId: string, id: string, patch: WebRulePatch) => {
    transact('Edit stylesheet rule', [{
      type: 'rule.patch',
      stylesheetId,
      id,
      patch,
    }])
  }, [transact])

  const setSelectedOverride = useCallback((override: WebOverride) => {
    const id = selectedRef.current
    const bound = id ? boundNodeIndex(documentRef.current.instances).get(id) : undefined
    if (!id || !bound) return
    transact('Override instance', [{
      type: 'instance.setOverride',
      instanceId: bound.instanceId,
      id,
      override,
    }])
  }, [transact])

  const clearSelectedOverride = useCallback(() => {
    const id = selectedRef.current
    const bound = id ? boundNodeIndex(documentRef.current.instances).get(id) : undefined
    if (!id || !bound) return
    transact('Clear override', [{
      type: 'instance.clearOverride',
      instanceId: bound.instanceId,
      id,
    }])
  }, [transact])

  const deleteSelectedInstance = useCallback(() => {
    const id = selectedRef.current
    if (!id) return
    const record = Object.values(documentRef.current.instances).find(
      (instance) => instance.rootId === id,
    )
    if (!record) return
    selectedRef.current = documentRef.current.nodes[id]?.parentId ?? null
    setSelectedId(selectedRef.current)
    transact('Delete instance', [{ type: 'instance.delete', id: record.id }])
  }, [transact])

  const defineComponentFromSelection = useCallback(() => {
    const id = selectedRef.current
    const source = id ? documentRef.current.nodes[id] : null
    if (!id || source?.kind !== 'element') {
      setNotice('Select an element to define a component from it.')
      return
    }
    const bound = boundNodeIndex(documentRef.current.instances)
    const subtree = collectSubtreeIds(documentRef.current, id)
    if (subtree.some((nodeId) => bound.has(nodeId))) {
      setNotice('Components cannot be defined from instance content. Define from ordinary nodes.')
      return
    }
    const compName = window.prompt('Component name', source.tag) ?? ''
    if (!compName.trim()) return
    const template = cloneSubtreeFresh(documentRef.current, id)
    const sheet = createWebStyleSheet(`component:${compName.trim()}`, {})
    transact(`Define ${compName.trim()}`, [{
      type: 'component.define',
      component: {
        id: webId('component'),
        name: compName.trim(),
        templateRootIds: [template[0]?.id ?? id],
        stylesheetId: sheet.id,
      },
      template,
      stylesheet: sheet,
    }])
  }, [transact])

  const instantiateSelectedComponent = useCallback((componentId: string) => {
    if (!componentId) return
    const selected = selectedRef.current
      ? documentRef.current.nodes[selectedRef.current]
      : null
    const parentId = selected?.kind === 'element'
      ? selected.id
      : (selected?.parentId ?? canvasParentId(pageIdRef.current))
    transact('Create instance', [{
      type: 'instance.create',
      componentId,
      parentId,
      order: nextOrder(documentRef.current, parentId),
    }])
  }, [transact])

  const pageRootId = pageId ?? pageParentId(document, null)
  const pageRootElement = pageRootId ? document.nodes[pageRootId] : undefined
  const pageBackgroundValue = pageRootElement?.kind === 'element'
    ? (pageRootElement.styles.background ?? pageRootElement.styles['background-color'] ?? '')
    : ''
  const pageBackground = /^#[\da-f]{6}$/i.test(pageBackgroundValue) ? pageBackgroundValue : '#ffffff'
  const visibleIds = useMemo(() => visibleRootIds(document, pageId), [document, pageId])
  const pages = useMemo(() => listPages(document), [document])
  // Page 1 has no node to carry a name, so its name is a field on the document.
  const renamePageOne = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    transact('Rename page', [{ type: 'page.setName', name: trimmed }])
  }, [transact])
  const layerIds = useMemo(() => pageLayerIds(document, pageId), [document, pageId])
  const frameIds = useMemo(
    () => layerIds.filter((id) => document.nodes[id]?.kind === 'element'),
    [document, layerIds],
  )
  useEffect(() => {
    frameIdsRef.current = frameIds
    scheduleMeasure()
  }, [frameIds, scheduleMeasure])

  const selectedNode = pageSelected ? null : selectedId ? document.nodes[selectedId] ?? null : null
  const matchingRules = matchingAuthoredRules(findElement(selectedId), document)
  const selectedBinding = selectedId ? boundNodeIndex(document.instances).get(selectedId) : undefined
  const selectedRecord = selectedBinding ? document.instances[selectedBinding.instanceId] : undefined
  const bound: BoundInspectorInfo | null = selectedBinding && selectedId
    ? {
      instanceId: selectedBinding.instanceId,
      componentName: selectedRecord
        ? (document.components[selectedRecord.componentId]?.name ?? selectedRecord.componentId)
        : selectedBinding.instanceId,
      isInstanceRoot: selectedRecord?.rootId === selectedId,
    }
    : null
  const selectedOverride = selectedBinding && selectedId
    ? document.instances[selectedBinding.instanceId]?.overrides[selectedId]
    : undefined
  const root = document.nodes[pageParentId(document, null) ?? '']
  const authoredCanvasWidth = root?.kind === 'element' ? parsePxAuthored(root.styles.width) : null
  const authoredCanvasHeight = root?.kind === 'element' ? parsePxAuthored(root.styles.height) : null
  const pageCanvas = pageId === null ? null : pageRootSize(document, pageId)
  const canvasWidth = pageCanvas?.width ?? document.metadata.page?.width ?? Math.max(authoredCanvasWidth ?? 1_440, contentSize.width)
  const canvasHeight = pageCanvas?.height ?? document.metadata.page?.height ?? Math.max(authoredCanvasHeight ?? 900, contentSize.height)
  // The box the page is drawn in. It does not follow its content: a frame that fills the
  // box would otherwise grow every time something was dragged past its edge, and the
  // thing being dragged could never leave. `canvasWidth` and `canvasHeight` above still
  // include the content, for fitting the view to everything.
  const boxWidth = pageCanvas?.width ?? document.metadata.page?.width ?? authoredCanvasWidth ?? 1_440
  const boxHeight = pageCanvas?.height ?? document.metadata.page?.height ?? authoredCanvasHeight ?? 900
  const fonts = useMemo(() => documentFonts(document), [document])
  const shortcutLabel = (id: BuiltInShortcutId) => formatBuiltInChord(id, shortcutConfig)

  const resizePage = useCallback((size: { width?: number; height?: number }) => {
    const width = size.width ?? canvasWidth
    const height = size.height ?? canvasHeight
    const target = pageIdRef.current
    transact('Resize page', [target === null
      ? { type: 'page.resize', width, height }
      : {
        type: 'node.patch',
        id: target,
        patch: { kind: 'element', styles: { width: `${width}px`, height: `${height}px` } },
      }])
  }, [canvasWidth, canvasHeight, transact])

  const patchSelected = useCallback((patch: {
    tag?: string
    attributes?: Record<string, string | null>
    styles?: Record<string, string | null>
  }) => {
    const id = selectedRef.current
    const node = id ? documentRef.current.nodes[id] : null
    if (!id || node?.kind !== 'element') return
    transact('Edit CSS element', [{
      type: 'node.patch',
      id,
      patch: { kind: 'element', ...patch },
    }])
  }, [transact])

  /**
   * Where something new that is not a frame goes: inside the selected frame,
   * centred, when one is selected; otherwise top level, beside what is there.
   * Either way it is free-positioned, so it can be moved and resized at once.
   */
  const placeInsert = useCallback((width: number, height: number) => {
    const current = documentRef.current
    const pageParent = canvasParentId(pageIdRef.current)
    const selected = selectedRef.current ? current.nodes[selectedRef.current] : null
    const holdsChildren =
      selected?.kind === 'element' &&
      !boundNodeIndex(current.instances).has(selected.id) &&
      ['frame', 'frame-row', 'frame-column', 'element'].includes(layerKind(selected))
    if (selected?.kind === 'element' && holdsChildren) {
      const frameWidth = parsePxAuthored(selected.styles.width)
      const frameHeight = parsePxAuthored(selected.styles.height)
      return {
        parentId: selected.id,
        x: frameWidth === null ? 24 : Math.max(0, Math.round((frameWidth - width) / 2)),
        y: frameHeight === null ? 24 : Math.max(0, Math.round((frameHeight - height) / 2)),
      }
    }
    const spot = freeFrameSpot(current, pageParent)
    return { parentId: pageParent, x: spot.x, y: spot.y }
  }, [])

  const insertElement = useCallback((tag: (typeof ELEMENT_TAGS)[number], point?: { x: number; y: number }, frame = false, size?: { width: number; height: number }, attributes?: Record<string, string>, parentOverride?: string | null) => {
    const selected = selectedRef.current
      ? documentRef.current.nodes[selectedRef.current]
      : null
    const rootParentId = canvasParentId(pageIdRef.current)
    // A new frame from the Insert menu is its own top-level object: outside any
    // frame that is selected, absolutely positioned so it can be moved and
    // resized, and set beside what is already there rather than on top of it.
    const asFrame = frame || (!point && tag === 'div')
    const origin = point ?? (asFrame ? freeFrameSpot(documentRef.current, rootParentId) : undefined)
    const extent = size ?? (asFrame && !point ? NEW_FRAME_SIZE : undefined)
    const parentId = origin
      ? (parentOverride !== undefined ? parentOverride : rootParentId)
      : selected?.kind === 'element'
        ? selected.id
        : (selected?.parentId ?? rootParentId)
    const element = createWebElement(tag, {
      parentId,
      order: nextOrder(documentRef.current, parentId),
      attributes: attributes ?? (tag === 'input' ? { type: 'text' } : tag === 'img' ? { alt: '' } : {}),
      styles: {
        ...initialStyles(tag),
        ...(asFrame ? { background: '#ffffff' } : {}),
        ...(origin ? { position: 'absolute', left: `${origin.x}px`, top: `${origin.y}px` } : {}),
        ...(extent ? { width: `${extent.width}px`, height: `${extent.height}px` } : {}),
      },
    })
    const text = initialText(tag)
    const operations: WebTransaction['operations'] = [
      { type: 'node.insert', node: element },
    ]
    if (text) {
      operations.push({
        type: 'node.insert',
        node: createWebText(text, { parentId: element.id, order: 1_024 }),
      })
    }
    selectedRef.current = element.id
    setSelectedId(element.id)
    setPageSelected(false)
    transact(`Insert <${tag}>`, operations)
  }, [transact])

  const insertLibraryIcon = useCallback(async (icon: { library: IconLibrary; name: string }) => {
    const { iconNodes } = await import('@sheet/canvas/web-icons')
    const place = placeInsert(24, 24)
    const nodes = iconNodes(icon.library, icon.name, {
      parentId: place.parentId,
      order: nextOrder(documentRef.current, place.parentId),
      left: place.x,
      top: place.y,
    })
    const svg = nodes?.[0]
    if (!nodes || !svg) {
      setNotice(`The ${icon.library} icon "${icon.name}" could not be found. Nothing was inserted.`)
      return
    }
    selectedRef.current = svg.id
    setSelectedId(svg.id)
    setPageSelected(false)
    transact(`Insert ${icon.name} icon`, nodes.map((node) => ({ type: 'node.insert' as const, node })))
    setTool('select')
    setLeftTab('design')
  }, [placeInsert, setTool, transact])

  const selectionColors = useMemo(() => {
    if (!selectedId || !document.nodes[selectedId]) return []
    return collectSelectionColors(
      collectSubtreeIds(document, selectedId).flatMap((id) => {
        const node = document.nodes[id]
        return node?.kind === 'element' ? [node.styles] : []
      }),
    )
  }, [document, selectedId])

  const replaceSelectionColor = useCallback((from: string, to: string) => {
    const current = documentRef.current
    const rootId = selectedRef.current
    if (!rootId) return
    const bound = boundNodeIndex(current.instances)
    const operations = collectSubtreeIds(current, rootId).flatMap((id) => {
      const node = current.nodes[id]
      if (node?.kind !== 'element' || bound.has(id)) return []
      const styles = replaceColorInStyles(node.styles, from, to)
      return styles ? [{ type: 'node.patch' as const, id, patch: { kind: 'element' as const, styles } }] : []
    })
    if (operations.length) transact('Replace selection color', operations)
  }, [transact])

  /**
   * Move a layer by hand: inside another (nesting it), or before or after one.
   * An instance's layers belong to its component, so they stay put. A
   * free-positioned layer keeps its place on the page when it changes parent:
   * its left and top are rewritten against the new parent so it does not jump.
   */
  const moveLayer = useCallback((id: string, targetId: string, zone: LayerDropZone) => {
    const current = documentRef.current
    const bound = boundNodeIndex(current.instances)
    if (bound.has(id) || bound.has(targetId)) {
      setNotice('Layers inside a component instance cannot be moved by hand. Edit the component instead.')
      return
    }
    const plan = planLayerMove(current, id, targetId, zone)
    if (!plan) return
    const node = current.nodes[id]
    if (!node || (plan.parentId === node.parentId && plan.order === node.order)) return
    const operations: WebTransaction['operations'] = [
      { type: 'node.move', id, parentId: plan.parentId, order: plan.order },
    ]
    if (node.kind === 'element' && node.styles.position === 'absolute' && plan.parentId !== node.parentId) {
      const element = findElement(id)
      const parentElement = plan.parentId === null ? hostRef.current : findElement(plan.parentId)
      if (element && parentElement) {
        const zoom = cameraRef.current.zoom
        const rect = element.getBoundingClientRect()
        const parentRect = parentElement.getBoundingClientRect()
        operations.push({
          type: 'node.patch',
          id,
          patch: {
            kind: 'element',
            styles: {
              left: `${roundAuthoredCss((rect.left - parentRect.left) / zoom)}px`,
              top: `${roundAuthoredCss((rect.top - parentRect.top) / zoom)}px`,
            },
          },
        })
      }
    }
    transact('Move layer', operations)
    selectedRef.current = id
    setSelectedId(id)
    setPageSelected(false)
  }, [findElement, transact])

  const renameNode = useCallback((id: string, name: string) => {
    if (documentRef.current.nodes[id]?.kind !== 'element') return
    transact('Rename layer', [{
      type: 'node.patch',
      id,
      patch: { kind: 'element', attributes: { [NAME_ATTRIBUTE]: name || null } },
    }])
  }, [transact])

  const selectPage = useCallback((id: string | null) => {
    pageIdRef.current = id
    setActivePageId(id)
    selectedRef.current = null
    setSelectedId(null)
    setPageSelected(false)
    hoveredRef.current = null
    setHoveredId(null)
    setPageResizePreview(null)
  }, [])

  const addPage = useCallback(() => {
    const current = documentRef.current
    const node = pageNode(nextPageName(current), { order: nextRootOrder(current), open: true })
    transact('Add page', [{ type: 'node.insert', node }])
    selectPage(node.id)
  }, [selectPage, transact])

  const renamePage = useCallback((id: string, name: string) => {
    if (!name.trim() || documentRef.current.nodes[id]?.kind !== 'element') return
    transact('Rename page', [{
      type: 'node.patch',
      id,
      patch: { kind: 'element', attributes: { [PAGE_ATTRIBUTE]: name.trim() } },
    }])
  }, [transact])

  const deletePage = useCallback((id: string) => {
    if (documentRef.current.nodes[id]?.kind !== 'element') return
    const remaining = listPages(documentRef.current).filter((page) => page.id !== id)
    transact('Delete page', [{ type: 'node.delete', id }])
    selectPage(remaining[0]?.id ?? null)
  }, [selectPage, transact])

  const toggleHidden = useCallback((id: string) => {
    const target = documentRef.current.nodes[id]
    if (target?.kind !== 'element') return
    const hidden = target.styles.visibility === 'hidden'
    transact(hidden ? 'Show element' : 'Hide element', [{
      type: 'node.patch',
      id,
      patch: { kind: 'element', styles: { visibility: hidden ? null : 'hidden' } },
    }])
  }, [transact])

  const insertPenPath = useCallback((point: { x: number; y: number }, stroke?: { x: number; y: number }[]) => {
    const draft = penDraftRef.current
    if (draft && !stroke) {
      const points = [...draft.points, point]
      penDraftRef.current = { ...draft, points }
      transact('Extend pen path', [{
        type: 'node.patch', id: draft.pathId,
        patch: { kind: 'element', attributes: { d: points.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') } },
      }])
      return
    }
    const parentId = canvasParentId(pageIdRef.current)
    const element = createWebElement('svg', {
      namespace: 'svg', parentId, order: nextOrder(documentRef.current, parentId),
      attributes: { viewBox: `0 0 ${canvasWidth} ${canvasHeight}` },
      styles: { width: `${canvasWidth}px`, height: `${canvasHeight}px`, position: 'absolute', left: '0', top: '0', 'pointer-events': 'none' },
    })
    const path = createWebElement('path', {
      namespace: 'svg', parentId: element.id, order: 1_024,
      attributes: { d: stroke && stroke.length > 1
        ? stroke.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
        : `M ${point.x} ${point.y} l 0.1 0.1`, fill: 'none', stroke: '#3b82f6', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    })
    penDraftRef.current = stroke ? null : { pathId: path.id, points: [point] }
    selectedRef.current = element.id
    setSelectedId(element.id)
    setPageSelected(false)
    transact('Insert pen path', [{ type: 'node.insert', node: element }, { type: 'node.insert', node: path }])
  }, [canvasWidth, canvasHeight, transact])

  const wrapInFlex = useCallback(() => {
    const id = selectedRef.current
    const node = id ? documentRef.current.nodes[id] : null
    if (!id || node?.kind !== 'element') return
    transact('Wrap in flex', [{
      type: 'node.patch',
      id,
      patch: {
        kind: 'element',
        styles: {
          display: 'flex',
          'flex-direction': node.styles['flex-direction'] || 'column',
          gap: node.styles.gap || '12px',
        },
      },
    }])
  }, [transact])

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    const id = selectedRef.current
    const node = id ? documentRef.current.nodes[id] : null
    if (!id || node?.kind !== 'element') return
    const currentLeft = parsePxAuthored(node.styles.left)
    const currentTop = parsePxAuthored(node.styles.top)
    const nextLeft = `${(currentLeft ?? 0) + dx}px`
    const nextTop = `${(currentTop ?? 0) + dy}px`
    transact('Nudge element', [{
      type: 'node.patch',
      id,
      patch: { kind: 'element', styles: { left: nextLeft, top: nextTop } },
    }])
  }, [transact])

  const deleteSelected = useCallback(() => {
    const id = selectedRef.current
    if (!id) return
    const parentId = documentRef.current.nodes[id]?.parentId ?? null
    selectedRef.current = parentId
    setSelectedId(parentId)
    transact('Delete element', [{ type: 'node.delete', id }])
  }, [transact])

  const editText = useCallback((element: HTMLElement | SVGElement, id: string) => {
    const node = documentRef.current.nodes[id]
    if (node?.kind !== 'element') return
    const textNode = orderedWebChildren(documentRef.current, id).find(
      (child) => child.kind === 'text',
    )
    if (!textNode || !(element instanceof HTMLElement)) return
    const bound = boundNodeIndex(documentRef.current.instances).get(textNode.id)
    element.contentEditable = 'true'
    element.focus()
    const selection = window.getSelection()
    selection?.selectAllChildren(element)
    selection?.collapseToEnd()
    element.addEventListener('blur', () => {
      element.removeAttribute('contenteditable')
      const text = element.textContent ?? ''
      if (textNode.kind === 'text' && text !== textNode.text) {
        if (bound) {
          transact('Override text', [{
            type: 'instance.setOverride',
            instanceId: bound.instanceId,
            id: textNode.id,
            override: { kind: 'text', text },
          }])
          return
        }
        transact('Edit text', [{
          type: 'node.patch',
          id: textNode.id,
          patch: { kind: 'text', text },
        }])
      }
    }, { once: true })
  }, [transact])

  const startElementDrag = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    edges?: ResizeEdges,
  ) => {
    const element = findElement(selectedRef.current)
    if (!element) return
    const node = selectedRef.current ? documentRef.current.nodes[selectedRef.current] : null
    const authored = node?.kind === 'element' ? node.styles : {}
    event.currentTarget.setPointerCapture(event.pointerId)
    const computedPosition = dragMoveKind(getComputedStyle(element).position)
    // A top-level layer is its own object on the page. One that still sits in the
    // page's flow (an image dropped or pasted in, say) is pinned to a free position
    // the first time it is moved or pulled from its top or left, so it can go anywhere.
    const isPageLayer =
      selectedRef.current !== null &&
      pageLayerIds(documentRef.current, pageIdRef.current).includes(selectedRef.current)
    // An image, icon or shader is pinned wherever it sits, even inside a frame whose
    // layout would otherwise hold it: it is its own object, not a part of the frame.
    // A frame inside a frame (a pane, a card, whatever holds other layers) is pinned the
    // same way, so it can be moved and sized from every side like a top-level one.
    const nestedFrame =
      !isPageLayer && node !== null && !isFreeObject(node) && isFrameInFrame(documentRef.current, node.id)
    const canPin = isPageLayer || isFreeObject(node) || nestedFrame
    let moveKind = mode === 'move' ? computedPosition : undefined
    let pinAbsolute = false
    if (mode === 'move' && moveKind === 'reorder' && canPin) {
      moveKind = 'absolute'
      pinAbsolute = true
    }
    let authoredLeft = parsePxAuthored(authored.left)
    let authoredTop = parsePxAuthored(authored.top)
    let authoredWidth = parsePxAuthored(authored.width)
    let authoredHeight = parsePxAuthored(authored.height)
    const rect = element.getBoundingClientRect()
    // Left and top are measured from the box an absolutely positioned layer is placed
    // in: its nearest positioned ancestor, which is not always its direct parent.
    const container = (element instanceof HTMLElement ? element.offsetParent : null) ?? element.parentElement
    const parentRect = container?.getBoundingClientRect() ?? rect
    const zoom = cameraRef.current.zoom
    // From where the layer sits now, not from an authored left and top a static box ignores.
    const fromRect = () => {
      authoredLeft = (rect.left - parentRect.left) / zoom
      authoredTop = (rect.top - parentRect.top) / zoom
    }
    if (mode === 'move' && moveKind === 'absolute') {
      if (pinAbsolute) {
        fromRect()
        // Out of its layout the box would shrink to its content, so it keeps the size it was drawn at.
        if (authoredWidth === null) authoredWidth = rect.width / zoom
        if (authoredHeight === null) authoredHeight = rect.height / zoom
      } else {
        if (authoredLeft === null) authoredLeft = (rect.left - parentRect.left) / zoom
        if (authoredTop === null) authoredTop = (rect.top - parentRect.top) / zoom
      }
    }
    // A size that is not in pixels (auto, a percentage) starts from what is drawn, so a
    // handle can always be dragged. The handle writes pixels; nothing else is converted.
    if (mode === 'resize' && (edges !== undefined || canPin) && (authoredWidth === null || authoredHeight === null)) {
      if (authoredWidth === null) authoredWidth = rect.width / zoom
      if (authoredHeight === null) authoredHeight = rect.height / zoom
    }
    // Pulling a west or north side moves the box's origin, which only a
    // free-positioned element has. A top-level layer in the page's flow is pinned
    // first; one inside a layout keeps to the sides that can move.
    // A nested frame in a layout is pinned on any resize: its width is otherwise owned by
    // the layout (a flex share, say), which is why only its height would follow a handle.
    let resizeEdges = edges
    if (mode === 'resize' && edges) {
      if (computedPosition === 'absolute') {
        if (edges.w || edges.n) {
          if (authoredLeft === null) authoredLeft = (rect.left - parentRect.left) / zoom
          if (authoredTop === null) authoredTop = (rect.top - parentRect.top) / zoom
        }
      } else if (canPin && (edges.w || edges.n || nestedFrame)) {
        fromRect()
        pinAbsolute = true
      } else if (edges.w || edges.n) {
        resizeEdges = { e: edges.e, s: edges.s }
      }
    }
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
      moveKind,
      pinAbsolute,
      resizeEdges,
      authoredLeft,
      authoredTop,
      authoredWidth,
      authoredHeight,
    }
    event.preventDefault()
    event.stopPropagation()
  }, [findElement])

  /**
   * Grab a frame by its body and it moves, as in any design tool. Only for a
   * free-positioned element: dragging something that sits in a layout would
   * reorder it on every stray click-drag, so those keep the label handle.
   */
  const startBodyDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || tool !== 'select' || isSpacePanning) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('button, [role="toolbar"], input, select, textarea, [contenteditable="true"]')) return
    const id = pickTarget(documentRef.current, webNodeIdFromElement(target))
    if (!id || boundNodeIndex(documentRef.current.instances).has(id)) return
    const element = findElement(id)
    if (!element) return
    // Free-positioned layers move by their body. So does a top-level layer that still sits
    // in the page's flow, which is pinned to a free position as it goes. A layer inside a
    // layout is left to its label handle, since a stray drag there would reorder it.
    const topLevel = pageLayerIds(documentRef.current, pageIdRef.current).includes(id)
    // Images, icons, shaders and frames inside frames are objects of their own and move
    // freely wherever they are nested.
    if (
      dragMoveKind(getComputedStyle(element).position) !== 'absolute' &&
      !topLevel &&
      !isFreeObject(documentRef.current.nodes[id]) &&
      !isFrameInFrame(documentRef.current, id)
    ) return
    select(id)
    startElementDrag(event, 'move')
  }, [tool, isSpacePanning, findElement, select, startElementDrag])

  const onDragMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !drag.element) return
    const dx = (event.clientX - drag.startX) / cameraRef.current.zoom
    const dy = (event.clientY - drag.startY) / cameraRef.current.zoom
    if (drag.mode === 'move' && drag.moveKind === 'reorder') {
      drag.element.style.transform = `translate(${dx}px, ${dy}px)`
    } else if (drag.mode === 'move') {
      if (drag.pinAbsolute) {
        drag.element.style.position = 'absolute'
        if (drag.authoredWidth !== null) drag.element.style.width = `${drag.authoredWidth}px`
        if (drag.authoredHeight !== null) drag.element.style.height = `${drag.authoredHeight}px`
      }
      if (drag.authoredLeft !== null) drag.element.style.left = `${drag.authoredLeft + dx}px`
      if (drag.authoredTop !== null) drag.element.style.top = `${drag.authoredTop + dy}px`
    } else if (drag.resizeEdges && drag.authoredWidth !== null && drag.authoredHeight !== null) {
      const box = resizeFromEdges(
        {
          left: drag.authoredLeft ?? 0,
          top: drag.authoredTop ?? 0,
          width: drag.authoredWidth,
          height: drag.authoredHeight,
        },
        drag.resizeEdges,
        dx,
        dy,
      )
      if (drag.pinAbsolute) drag.element.style.position = 'absolute'
      drag.element.style.width = `${box.width}px`
      drag.element.style.height = `${box.height}px`
      if (drag.resizeEdges.w) drag.element.style.left = `${box.left}px`
      if (drag.resizeEdges.n) drag.element.style.top = `${box.top}px`
    } else {
      if (drag.authoredWidth !== null) {
        drag.element.style.width = `${Math.max(1, drag.authoredWidth + dx)}px`
      }
      if (drag.authoredHeight !== null) {
        drag.element.style.height = `${Math.max(1, drag.authoredHeight + dy)}px`
      }
    }
    measure()
  }, [measure])

  const finishElementDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !drag.element) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    const id = selectedRef.current
    if (!id) return
    if (drag.mode === 'move' && drag.moveKind === 'reorder') {
      const node = documentRef.current.nodes[id]
      const parentElement = drag.element.parentElement
      if (node && parentElement) {
        drag.element.style.transform = ''
        const parentStyle = getComputedStyle(parentElement)
        const axis = reorderAxis(parentStyle.display, parentStyle.flexDirection)
        const siblings = orderedWebChildren(documentRef.current, node.parentId).map((sibling) => {
          const target = sibling.id === id
            ? drag.element
            : parentElement.querySelector(
              `[data-sheet-node="${sibling.id.replace(/["\\]/g, '\\$&')}"]`,
            )
          const rect = target?.getBoundingClientRect()
          return {
            id: sibling.id,
            order: sibling.order,
            top: rect?.top ?? 0,
            left: rect?.left ?? 0,
            bottom: rect?.bottom ?? 0,
            right: rect?.right ?? 0,
          }
        })
        const order = computeReorderOrder(
          siblings,
          id,
          node.order,
          event.clientX,
          event.clientY,
          axis,
        )
        if (order !== null && order !== node.order) {
          transact('Reorder element', [{
            type: 'node.move',
            id,
            parentId: node.parentId,
            order,
          }])
          return
        }
        scheduleMeasure()
        return
      }
    }
    const zoom = cameraRef.current.zoom
    if (drag.mode === 'move' && drag.moveKind === 'absolute') {
      if (event.clientX === drag.startX && event.clientY === drag.startY) {
        drag.element.style.transform = ''
        scheduleMeasure()
        return
      }
      const committed = commitAbsoluteMove(
        { left: drag.authoredLeft ?? 0, top: drag.authoredTop ?? 0 },
        drag.startX,
        drag.startY,
        event.clientX,
        event.clientY,
        zoom,
      )
      drag.element.style.transform = ''
      transact('Move element', [{
        type: 'node.patch',
        id,
        patch: {
          kind: 'element',
          styles: {
            left: committed.left,
            top: committed.top,
            ...(drag.pinAbsolute
              ? {
                position: 'absolute',
                ...(drag.authoredWidth !== null ? { width: `${drag.authoredWidth}px` } : {}),
                ...(drag.authoredHeight !== null ? { height: `${drag.authoredHeight}px` } : {}),
              }
              : {}),
          },
        },
      }])
      return
    }
    if (drag.mode === 'resize' && drag.resizeEdges && drag.authoredWidth !== null && drag.authoredHeight !== null) {
      if (event.clientX === drag.startX && event.clientY === drag.startY) {
        scheduleMeasure()
        return
      }
      const box = resizeFromEdges(
        {
          left: drag.authoredLeft ?? 0,
          top: drag.authoredTop ?? 0,
          width: drag.authoredWidth,
          height: drag.authoredHeight,
        },
        drag.resizeEdges,
        (event.clientX - drag.startX) / zoom,
        (event.clientY - drag.startY) / zoom,
      )
      const styles: Record<string, string | null> = {
        width: `${box.width}px`,
        height: `${box.height}px`,
      }
      if (drag.resizeEdges.w) styles.left = `${box.left}px`
      if (drag.resizeEdges.n) styles.top = `${box.top}px`
      if (drag.pinAbsolute) styles.position = 'absolute'
      transact('Resize element', [{ type: 'node.patch', id, patch: { kind: 'element', styles } }])
      return
    }
    if (drag.mode === 'resize') {
      const committed = commitResize(
        { width: drag.authoredWidth, height: drag.authoredHeight },
        drag.startX,
        drag.startY,
        event.clientX,
        event.clientY,
        zoom,
      )
      drag.element.style.transform = ''
      if (committed.width === undefined && committed.height === undefined) {
        const node = documentRef.current.nodes[id]
        const current = node?.kind === 'element' ? node.styles : {}
        setNotice(
          `Resize needs pixel width/height; current values are width: ${current.width ?? 'unset'}, height: ${current.height ?? 'unset'}.`,
        )
        scheduleMeasure()
        return
      }
      const styles: Record<string, string | null> = {}
      if (committed.width !== undefined) styles.width = committed.width
      if (committed.height !== undefined) styles.height = committed.height
      if (committed.declined.length > 0) {
        setNotice(`Resize skipped non-pixel ${committed.declined.join(' and ')}; no units were converted.`)
      }
      transact('Resize element', [{
        type: 'node.patch',
        id,
        patch: { kind: 'element', styles },
      }])
      return
    }
    drag.element.style.transform = ''
    scheduleMeasure()
  }, [transact, scheduleMeasure])

  const setNextCamera = useCallback((next: Camera) => {
    cameraRef.current = next
    // Move the page now, without waiting for a React render; state catches up next frame.
    if (pageBoundsRef.current) pageBoundsRef.current.style.transform = cameraTransform(next)
    scheduleMeasure()
  }, [scheduleMeasure])

  /**
   * Place a frame of a chosen size on the canvas: top level, white, set beside
   * what is there, then selected and brought into view. This is what picking a
   * size in the Frame panel does.
   */
  /** Bring a box of canvas px into view: keep the zoom unless it would not fit, then centre on it. */
  const revealBox = useCallback((box: { x: number; y: number; width: number; height: number }) => {
    const stage = stageRef.current
    if (!stage) return
    const zoom = Math.max(
      0.05,
      Math.min(cameraRef.current.zoom, (stage.clientWidth * 0.8) / box.width, (stage.clientHeight * 0.8) / box.height),
    )
    setNextCamera({
      zoom,
      x: stage.clientWidth / 2 - (box.x + box.width / 2) * zoom,
      y: stage.clientHeight / 2 - (box.y + box.height / 2) * zoom,
    })
  }, [setNextCamera])

  const insertFrame = useCallback((preset: FramePreset) => {
    const parentId = canvasParentId(pageIdRef.current)
    const origin = freeFrameSpot(documentRef.current, parentId)
    const element = frameNode({
      parentId,
      order: nextOrder(documentRef.current, parentId),
      name: preset.name,
      width: preset.width,
      height: preset.height,
      left: origin.x,
      top: origin.y,
    })
    selectedRef.current = element.id
    setSelectedId(element.id)
    setPageSelected(false)
    transact(`Insert ${preset.name} frame`, [{ type: 'node.insert', node: element }])
    // Back to the select tool, so the frame can be moved and resized at once.
    setTool('select')
    Sound.success()
    revealBox({ ...origin, width: preset.width, height: preset.height })
  }, [revealBox, setTool, transact])

  /**
   * Place a shader the way a frame is placed: top level, free-positioned beside
   * what is there, selected and in view, so it can be moved and resized at once.
   */
  const insertShader = useCallback((name: ShaderName) => {
    const parentId = canvasParentId(pageIdRef.current)
    const origin = freeFrameSpot(documentRef.current, parentId)
    const node = shaderNode(name, {
      parentId,
      order: nextOrder(documentRef.current, parentId),
      left: origin.x,
      top: origin.y,
    })
    selectedRef.current = node.id
    setSelectedId(node.id)
    setPageSelected(false)
    transact(`Insert ${name} shader`, [{ type: 'node.insert', node }])
    setTool('select')
    Sound.success()
    revealBox({ ...origin, width: 400, height: 300 })
  }, [revealBox, setTool, transact])

  const fitCamera = useCallback((width: number, height: number): Camera | null => {
    const stage = stageRef.current
    if (!stage || stage.clientWidth === 0 || stage.clientHeight === 0) return null
    const margin = 72
    const zoom = Math.min(
      1,
      Math.max(0.1, Math.min((stage.clientWidth - margin * 2) / width, (stage.clientHeight - margin * 2) / height)),
    )
    return {
      zoom,
      x: Math.round((stage.clientWidth - width * zoom) / 2),
      y: Math.round(Math.max(margin / 2, (stage.clientHeight - height * zoom) / 2)),
    }
  }, [])

  const pageSizeRef = useRef({ width: canvasWidth, height: canvasHeight })
  pageSizeRef.current = { width: canvasWidth, height: canvasHeight }

  const fitToView = useCallback(() => {
    const { width, height } = pageSizeRef.current
    setNextCamera(fitCamera(width, height) ?? { x: 320, y: 120, zoom: 0.75 })
  }, [fitCamera, setNextCamera])

  const zoomStage = useCallback((factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const current = cameraRef.current
    const zoom = Math.min(4, Math.max(0.08, current.zoom * factor))
    const cx = stage.clientWidth / 2
    const cy = stage.clientHeight / 2
    const ratio = zoom / current.zoom
    setNextCamera({
      zoom,
      x: cx - (cx - current.x) * ratio,
      y: cy - (cy - current.y) * ratio,
    })
  }, [setNextCamera])

  const setExactZoom = useCallback((targetZoom: number) => {
    const stage = stageRef.current
    if (!stage) return
    const current = cameraRef.current
    const zoom = Math.min(4, Math.max(0.08, targetZoom))
    const cx = stage.clientWidth / 2
    const cy = stage.clientHeight / 2
    const ratio = zoom / current.zoom
    setNextCamera({
      zoom,
      x: cx - (cx - current.x) * ratio,
      y: cy - (cy - current.y) * ratio,
    })
  }, [setNextCamera])

  // Frame the page once the stage has a real size (never in a zero-size stage).
  useEffect(() => {
    const next = fitCamera(pageSizeRef.current.width, pageSizeRef.current.height)
    if (next) setNextCamera(next)
  }, [fitCamera, setNextCamera])

  // Each page is its own canvas: frame it whenever the active page changes.
  useEffect(() => {
    const next = fitCamera(pageSizeRef.current.width, pageSizeRef.current.height)
    if (next) setNextCamera(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // Overlays are measured against the stage, so any stage resize (window, panel toggle) must remeasure.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => scheduleMeasure())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [scheduleMeasure])

  // Non-passive so pinch/ctrl+wheel zooms the canvas instead of the webview; plain wheel pans.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="toolbar"]')) return
      event.preventDefault()
      const current = cameraRef.current
      if (event.ctrlKey || event.metaKey) {
        const zoom = Math.min(4, Math.max(0.1, current.zoom * Math.exp(-event.deltaY * 0.002)))
        const rect = stage.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        const ratio = zoom / current.zoom
        setNextCamera({ zoom, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio })
        return
      }
      setNextCamera({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [setNextCamera])

  const isPanningActive = tool === 'pan' || isSpacePanning

  const canvasPoint = (event: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.round((event.clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom)),
      y: Math.max(0, Math.round((event.clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom)),
    }
  }

  const startDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isSpacePanning || tool === 'select' || tool === 'pan' || tool === 'image' || tool === 'comment') return
    if (event.target instanceof Element && event.target.closest('button, [role="toolbar"], input, select, textarea')) return
    const start = canvasPoint(event)
    const next: DrawingDraft = { pointerId: event.pointerId, tool, start, end: start, points: [start] }
    drawingRef.current = next
    setDrawing(next)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    const draft = drawingRef.current
    if (!draft || draft.pointerId !== event.pointerId) return
    const end = canvasPoint(event)
    const next = { ...draft, end, points: draft.tool === 'pen' ? [...draft.points, end] : draft.points }
    drawingRef.current = next
    setDrawing(next)
  }

  const finishDrawing = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const draft = drawingRef.current
    if (!draft || draft.pointerId !== event.pointerId) return
    drawingRef.current = null
    setDrawing(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
    if (cancelled) return
    const end = canvasPoint(event)
    if (draft.tool === 'pen') {
      insertPenPath(draft.start, [...draft.points, end])
      return
    }
    const width = Math.abs(end.x - draft.start.x)
    const height = Math.abs(end.y - draft.start.y)
    insertElement(
      draft.tool === 'text' ? 'p' : 'div',
      { x: Math.min(draft.start.x, end.x), y: Math.min(draft.start.y, end.y) },
      draft.tool === 'frame',
      width > 3 || height > 3 ? { width: Math.max(1, width), height: Math.max(1, height) } : undefined,
    )
    // A frame is one thing you set down; the next thing you do is work with it.
    if (draft.tool === 'frame') setTool('select')
  }

  const startPageResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>, pageCorner: 'nw' | 'ne' | 'sw' | 'se') => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode: 'page-resize', pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      authoredLeft: null, authoredTop: null,
      authoredWidth: canvasWidth, authoredHeight: canvasHeight,
      camera: cameraRef.current, pageCorner,
    }
    setPageResizePreview({ width: canvasWidth, height: canvasHeight })
    event.preventDefault()
    event.stopPropagation()
  }, [canvasWidth, canvasHeight])

  const pageSizeAtPointer = (drag: DragState, clientX: number, clientY: number) => {
    const corner = drag.pageCorner ?? 'se'
    const zoom = drag.camera?.zoom ?? cameraRef.current.zoom
    return {
      width: Math.max(1, Math.round(((drag.authoredWidth ?? 0) + (corner.endsWith('e') ? 1 : -1) * (clientX - drag.startX) / zoom) * 100) / 100),
      height: Math.max(1, Math.round(((drag.authoredHeight ?? 0) + (corner.startsWith('s') ? 1 : -1) * (clientY - drag.startY) / zoom) * 100) / 100),
    }
  }

  const movePageCamera = (drag: DragState, size: { width: number; height: number }) => {
    if (!drag.camera) return
    setNextCamera({
      ...drag.camera,
      x: drag.camera.x + (drag.pageCorner?.endsWith('w') ? ((drag.authoredWidth ?? 0) - size.width) * drag.camera.zoom : 0),
      y: drag.camera.y + (drag.pageCorner?.startsWith('n') ? ((drag.authoredHeight ?? 0) - size.height) * drag.camera.zoom : 0),
    })
  }

  const movePageResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag?.mode !== 'page-resize' || drag.pointerId !== event.pointerId) return
    const size = pageSizeAtPointer(drag, event.clientX, event.clientY)
    setPageResizePreview(size)
    movePageCamera(drag, size)
    event.stopPropagation()
  }

  const finishPageResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current
    if (drag?.mode !== 'page-resize' || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setPageResizePreview(null)
    if (cancelled) {
      if (drag.camera) setNextCamera(drag.camera)
    } else {
      const size = pageSizeAtPointer(drag, event.clientX, event.clientY)
      movePageCamera(drag, size)
      resizePage(size)
    }
    event.stopPropagation()
  }, [resizePage, setNextCamera])

  const startPan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!isPanningActive && event.button !== 1) return
    if (event.target instanceof Element && event.target.closest('button, [role="toolbar"], input, select, textarea')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      authoredLeft: null,
      authoredTop: null,
      authoredWidth: null,
      authoredHeight: null,
      camera: cameraRef.current,
    }
    event.preventDefault()
  }, [isPanningActive])

  const movePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.mode !== 'pan' || drag.pointerId !== event.pointerId || !drag.camera) return
    setNextCamera({
      ...drag.camera,
      x: drag.camera.x + event.clientX - drag.startX,
      y: drag.camera.y + event.clientY - drag.startY,
    })
  }, [setNextCamera])

  const finishPan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.mode !== 'pan' || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }, [])

  const undo = useCallback(() => {
    const transaction = history.at(-1)
    if (!transaction) return
    const forward = applyWebTransaction(documentRef.current, transaction).inverse
    setHistory((current) => current.slice(0, -1))
    setRedo((current) => [...current, forward])
    void saveTransaction(
      { ...transaction, id: webId('webtx'), label: `Undo ${transaction.label}` },
      { recordHistory: false },
    )
  }, [history, saveTransaction])

  const redoLast = useCallback(() => {
    const transaction = redo.at(-1)
    if (!transaction) return
    const inverse = applyWebTransaction(documentRef.current, transaction).inverse
    setRedo((current) => current.slice(0, -1))
    setHistory((current) => [...current, inverse])
    void saveTransaction(
      { ...transaction, id: webId('webtx'), label: `Redo ${transaction.label}` },
      { recordHistory: false },
    )
  }, [redo, saveTransaction])

  // Global Keyboard Shortcuts handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      // Spacebar hold for temporary pan
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setIsSpacePanning(true)
        return
      }

      const hit = matchShortcut(e, shortcutConfig)
      if (hit === 'tool.select') setTool('select')
      else if (hit === 'tool.hand') setTool('pan')
      else if (hit === 'tool.frame') setTool('frame')
      else if (hit === 'tool.box') setTool('box')
      else if (hit === 'tool.pen') setTool('pen')
      else if (hit === 'tool.text') setTool('text')
      else if (hit === 'tool.image') setTool('image')
      else if (hit === 'delete' && selectedRef.current) deleteSelected()
      else if (hit === 'escape') {
        if (selectedRef.current) select(null)
        else setTool('select')
      } else if (hit === 'undo') undo()
      else if (hit === 'redo') redoLast()
      else if (hit === 'zoomIn') {
        setNextCamera({ ...cameraRef.current, zoom: Math.min(4, cameraRef.current.zoom * 1.2) })
      } else if (hit === 'zoomOut') {
        setNextCamera({ ...cameraRef.current, zoom: Math.max(0.1, cameraRef.current.zoom / 1.2) })
      } else if (hit === 'zoomReset') {
        setNextCamera({ ...cameraRef.current, zoom: 1 })
      } else if (hit === 'zoomToFit') {
        fitToView()
      } else if (selectedRef.current && hit?.startsWith('nudge')) {
        const step = e.shiftKey ? 10 : 1
        const delta: Record<string, [number, number]> = {
          nudgeLeft: [-step, 0],
          nudgeRight: [step, 0],
          nudgeUp: [0, -step],
          nudgeDown: [0, step],
        }
        const [dx, dy] = delta[hit] ?? [0, 0]
        nudgeSelected(dx, dy)
      } else if (hit) {
        return
      } else {
        // Wrap in flex is a document-specific command, not a remappable toolbar tool.
        if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          wrapInFlex()
        }
        if (e.key === '\\' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          toggleFocusMode()
          return
        }
        if (!e.shiftKey && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          setTool('comment')
        }
        return
      }
      e.preventDefault()
      return

    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePanning(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [deleteSelected, fitToView, insertElement, insertPenPath, nudgeSelected, redoLast, select, setNextCamera, shortcutConfig, toggleFocusMode, undo, wrapInFlex])

  /**
   * Copy the selected layer as a PNG. It renders the live document, not the saved
   * one, so an edit made a moment ago is in the picture, and it uses the renderer
   * Export uses, so the image matches what Export would give for that layer.
   */
  const copySelectionImage = useCallback(async () => {
    const id = selectedRef.current
    if (!id || !documentRef.current.nodes[id]) throw new Error('Select something on the canvas first')
    const html = compileWebStandaloneHtml(documentRef.current, { title: documentRef.current.name })
    await copyImage(captureImage({ html, rootId: id }))
  }, [])

  // What the palette (⌘K / Ctrl+K) can do while this file is open.
  const paletteCommands = useMemo<AppCommand[]>(() => [
    { id: 'fit', label: 'Zoom to fit', keywords: 'fit view canvas', shortcut: formatBuiltInChord('zoomToFit', shortcutConfig), icon: <CropIcon />, run: fitToView },
    { id: 'layers', label: leftPanelOpen ? 'Hide layers panel' : 'Show layers panel', keywords: 'sidebar left pages', icon: <PanelLeftIcon />, run: () => setLeftPanelOpen((open) => !open) },
    { id: 'design', label: rightPanelOpen ? 'Hide design panel' : 'Show design panel', keywords: 'inspector right properties', icon: <PanelRightIcon />, run: () => setRightPanelOpen((open) => !open) },
    { id: 'focus', label: focusMode ? 'Leave focus mode' : 'Focus mode', keywords: 'zen hide panels', shortcut: '\\', icon: <MaximizeIcon />, run: toggleFocusMode },
    { id: 'frame', label: 'Frame tool', keywords: 'artboard size', shortcut: formatBuiltInChord('tool.frame', shortcutConfig), icon: <FrameIcon />, run: () => { setTool('frame'); setRightPanelOpen(true); setRightTab('design') } },
    { id: 'comments', label: 'Show comments', keywords: 'feedback threads', icon: <MessageSquareIcon />, run: () => { setRightPanelOpen(true); setRightTab('comments') } },
    { id: 'icons', label: 'Browse icons', keywords: 'insert library', icon: <ComponentIcon />, run: () => { setLeftPanelOpen(true); setLeftTab('assets'); setAssetsKind('icons') } },
    { id: 'shaders', label: 'Browse shaders', keywords: 'gradient background', icon: <ColorsIcon />, run: () => setShadersOpen(true) },
    { id: 'agent', label: 'Connect an agent', keywords: 'mcp claude cursor', icon: <BotIcon />, run: () => setConnectAgentOpen(true) },
    // Every dependency is stable between renders that change nothing here, so
    // the palette re-registers only when a label or an action really changes.
  ], [fitToView, focusMode, leftPanelOpen, rightPanelOpen, setTool, shortcutConfig, toggleFocusMode])
  useRegisterCommands('editor', paletteCommands)

  const barButtonClassName =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-surface/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.92] aria-pressed:text-foreground'

  // The tools, in the order a design is made: move around, block it out, fill
  // it in, then talk about it. Groups are split by hairlines.
  const toolButtons = (
    <>
      <WebToolButton
        label={`Select (${shortcutLabel('tool.select')})`}
        aria-label="Select"
        active={tool === 'select' && !isSpacePanning}
        onClick={() => setTool('select')}
      >
        <MousePointer2Icon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label={`Hand (${shortcutLabel('tool.hand')})`}
        aria-label="Hand"
        active={tool === 'pan' || isSpacePanning}
        onClick={() => setTool('pan')}
      >
        <HandIcon className="size-4" />
      </WebToolButton>

      <div className="my-1 h-px w-5 shrink-0 bg-line/80" />

      <WebToolButton
        label={`Frame (${shortcutLabel('tool.frame')})`}
        aria-label="Frame"
        active={tool === 'frame'}
        onClick={() => {
          setTool('frame')
          // The size list lives in the right panel; make sure it is there to see.
          setRightPanelOpen(true)
          setRightTab('design')
        }}
      >
        <FrameIcon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label={`Rectangle (${shortcutLabel('tool.box')})`}
        aria-label="Rectangle"
        active={tool === 'box'}
        onClick={() => setTool('box')}
      >
        <SquareIcon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label={`Pen (${shortcutLabel('tool.pen')})`}
        aria-label="Pen"
        active={tool === 'pen'}
        onClick={() => setTool('pen')}
      >
        <PenTool01Icon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label={`Text (${shortcutLabel('tool.text')})`}
        aria-label="Text"
        active={tool === 'text'}
        onClick={() => setTool('text')}
      >
        <TypeIcon className="size-4" />
      </WebToolButton>

      <div className="my-1 h-px w-5 shrink-0 bg-line/80" />

      <div className="relative">
        <WebToolButton
          label="Insert element"
          aria-label="Insert element"
          active={quickInsertOpen}
          onClick={() => setQuickInsertOpen((open) => !open)}
        >
          <PlusCircleIcon className="size-4" />
        </WebToolButton>
        {quickInsertOpen ? (
          <div className="app-page-enter absolute left-full top-0 z-40 ms-2 w-40 origin-top-left rounded-xl bg-popover p-1 text-foreground shadow-panel-lg">
            <div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">Insert element</div>
            <div className="max-h-[min(14rem,50vh)] space-y-0.5 overflow-y-auto">
              {ELEMENT_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="flex h-7 w-full items-center rounded-lg px-2 text-left font-mono text-xs text-foreground outline-none transition-colors duration-100 hover:bg-accent focus-visible:bg-accent"
                  onClick={() => {
                    insertElement(tag)
                    setQuickInsertOpen(false)
                  }}
                >
                  &lt;{tag}&gt;
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <WebToolButton
        label={`Image (${shortcutLabel('tool.image')})`}
        aria-label="Image"
        active={tool === 'image'}
        onClick={() => {
          setTool('image')
          setLeftPanelOpen(true)
          setLeftTab('assets')
          setAssetsKind('images')
        }}
      >
        <ImageIcon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label="Icon library"
        aria-label="Icon library"
        active={leftPanelOpen && leftTab === 'assets' && assetsKind === 'icons'}
        onClick={() => {
          setLeftPanelOpen(true)
          setLeftTab('assets')
          setAssetsKind('icons')
        }}
      >
        <ComponentIcon className="size-4" />
      </WebToolButton>
      <WebToolButton
        label="Shaders"
        aria-label="Shaders"
        active={shadersOpen}
        onClick={() => setShadersOpen(true)}
      >
        <ColorsIcon className="size-4" />
      </WebToolButton>

      <div className="my-1 h-px w-5 shrink-0 bg-line/80" />

      <WebToolButton
        label="Comment (C)"
        aria-label="Comment"
        active={tool === 'comment'}
        onClick={() => {
          setTool('comment')
          setRightPanelOpen(true)
          setRightTab('comments')
        }}
      >
        <MessageSquareIcon className="size-4" />
      </WebToolButton>
    </>
  )
  const trailingControls = (
    <>
      {agentActivity ? (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'flex h-7 min-w-0 items-center gap-1.5 truncate rounded-md px-2 text-xs transition-opacity duration-300',
            agentActivity.phase === 'working' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full bg-cx-accent',
              agentActivity.phase === 'working' ? 'animate-pulse' : 'opacity-50',
            )}
          />
          <span className="truncate">
            {agentActivity.phase === 'working' ? agentActivity.label : 'Agent finished'}
          </span>
        </span>
      ) : null}
      {notice ? (
        <div className="flex min-w-0 max-w-[45%] shrink items-center">
          <span
            role="alert"
            className="min-w-0 truncate rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive-foreground"
            title={notice}
          >
            {notice}
          </span>
          {pendingSavesRef.current.length > 0 && saveStatus === 'error' ? (
            <button type="button" className="ms-1 shrink-0 whitespace-nowrap rounded-md px-2 text-xs text-foreground shadow-hairline" onClick={() => void flushSaves()}>Retry save</button>
          ) : null}
        </div>
      ) : null}
      <CopyImageButton
        enabled={selectedId !== null && !pageSelected && document.nodes[selectedId] !== undefined}
        onCopy={copySelectionImage}
        onError={setNotice}
      />
      <BrowserCaptureImport onImport={(input) => {
        const imported = browserCaptureTransaction(documentRef.current, input, canvasParentId(pageId))
        if (!saveTransaction(imported.transaction)) throw new Error('Capture could not be inserted. Nothing was changed.')
        setSelectedId(imported.rootId)
        if (imported.warnings.length) setNotice(imported.warnings.join(' '))
        requestAnimationFrame(() => fitToView())
      }} />
      <ExportMenu designId={designId} draftId={draftId} onError={setNotice} />
    </>
  )

  const leadingControls = (
    <button
      type="button"
      aria-label={leftPanelOpen ? 'Collapse layers panel' : 'Open layers panel'}
      aria-pressed={leftPanelOpen}
      title={leftPanelOpen ? 'Collapse layers panel' : 'Open layers panel'}
      data-cuelume-select=""
      className={cn(barButtonClassName, leftPanelOpen && 'bg-foreground/[0.07] text-foreground')}
      onClick={() => setLeftPanelOpen((open) => !open)}
    >
      <PanelLeftIcon className="size-3.5" />
    </button>
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground font-sans antialiased">
      {/* Portalled Title Bar Controls */}
      {slots.leading ? createPortal(leadingControls, slots.leading) : null}
      {slots.trailing ? createPortal(trailingControls, slots.trailing) : null}
      {!slots.trailing && (
        <header
          data-tauri-drag-region
          className="z-30 flex h-9 w-full min-w-0 shrink-0 select-none items-center gap-2 border-b border-line bg-surface px-3"
        >
          {leadingControls}
          <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
          {trailingControls}
        </header>
      )}

      {/* Main Workspace Layout with Responsive Screen Adaptation */}
      <div
        className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden', isCompact ? 'flex flex-row' : 'grid')}
        style={isCompact ? undefined : {
          gridTemplateColumns: [
            leftPanelOpen ? `${leftWidth}px` : null,
            'minmax(0,1fr)',
            rightPanelOpen ? `${rightWidth}px` : null,
          ].filter(Boolean).join(' '),
        }}
      >
        {/* Left panel: the file's structure, what can be placed, its tokens. */}
        {leftPanelOpen ? (
          <aside
            aria-label="Layers"
            className={cn(
              'relative flex min-h-0 min-w-0 flex-col border-e border-line bg-surface text-foreground',
              isCompact && 'absolute inset-y-0 start-0 z-40 w-72 shadow-panel-lg',
            )}
          >
            {isCompact ? null : (
              <PanelResizer side="left" width={leftWidth} fallback={256} onResize={setLeftWidth} label="Resize layers panel" />
            )}
            <PanelTabs
              label="Left panel"
              value={leftTab}
              onChange={setLeftTab}
              options={[
                // Pages and Layers live under it, so the tab names the whole file.
                { value: 'design', label: 'File' },
                { value: 'assets', label: 'Assets' },
                { value: 'theme', label: 'Theme' },
              ]}
            />
            {leftTab === 'design' ? (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {/* Pages Section */}
                <div className="border-b border-line">
                  <div className="flex h-10 items-center justify-between px-3 text-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setPagesOpen((open) => !open)}
                    >
                      <ChevronDownIcon className={cn('size-3 transition-transform duration-200 ease-smooth', !pagesOpen && '-rotate-90')} />
                      <span className="text-xs font-semibold text-foreground">Pages</span>
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      onClick={addPage}
                      title="Add page"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </div>
                  {pagesOpen ? (
                    <div className="pb-2">
                      {pages.map((page) => (
                        <PageRow
                          key={page.id ?? 'implicit'}
                          name={page.name}
                          active={page.id === pageId}
                          removable={page.id !== null}
                          onSelect={() => {
                            if (page.id !== pageId) selectPage(page.id)
                            selectedRef.current = null
                            setSelectedId(null)
                            setPageSelected(true)
                            scheduleMeasure()
                          }}
                          onRename={(name) => (page.id === null ? renamePageOne(name) : renamePage(page.id as string, name))}
                          onDelete={page.id === null ? null : () => deletePage(page.id as string)}
                          pageSelected={pageSelected}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Layers Section */}
                <div className="py-1">
                  <div className="flex h-8 items-center justify-between px-4 text-xs font-medium text-muted-foreground">
                    <span className="text-xs font-semibold text-foreground">Layers</span>
                  </div>
                  {/* Dropping on the empty space under the rows sets a layer last at the top
                      level, which is how a nested layer is pulled back out. */}
                  <div
                    className="min-h-10"
                    onDragOver={(event) => {
                      if (draggedLayerId && event.target === event.currentTarget) {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }
                    }}
                    onDrop={(event) => {
                      const dragged = draggedLayerId
                      const last = layerIds.at(-1)
                      if (!dragged || !last || event.target !== event.currentTarget) return
                      event.preventDefault()
                      draggedLayerId = null
                      moveLayer(dragged, last, 'after')
                    }}
                  >
                    {layerIds.length === 0 ? (
                      <div className="mx-3 rounded-lg border border-dashed border-line p-4 text-center">
                        <p className="text-xs text-muted-foreground">This page is empty.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 border-line bg-surface-2 text-xs text-foreground hover:bg-secondary"
                          aria-label="Create root element"
                          onClick={() => {
                            // Frames come from the Frame tool's size list on the right.
                            setTool('frame')
                            setRightPanelOpen(true)
                          }}
                        >
                          Add a frame
                        </Button>
                      </div>
                    ) : (
                      layerIds.map((id) => {
                        const node = document.nodes[id]
                        return node ? (
                          <WebTreeNode
                            key={id}
                            document={document}
                            node={node}
                            selectedId={selectedId}
                            onSelect={select}
                            onToggleHidden={toggleHidden}
                            onRename={renameNode}
                            onMove={moveLayer}
                          />
                        ) : null
                      })
                    )}
                  </div>
                </div>

                {/* Components Section */}
                <div className="mt-2 flex items-center justify-between border-t border-line px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Components</span>
                  <button type="button" aria-label="Create component" title="Create component from selection" className="rounded p-1 hover:bg-secondary hover:text-foreground disabled:opacity-40" disabled={!selectedId} onClick={defineComponentFromSelection}>
                    <PlusIcon className="size-3.5" />
                  </button>
                </div>
                <div className="px-2 pb-3">
                  {Object.keys(document.components).length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Select an element to create a component.</p>
                  ) : (
                    <select
                      aria-label="Component"
                      defaultValue=""
                      className="h-8 w-full min-w-0 rounded-md border border-input bg-surface-2 px-2 text-xs text-foreground outline-none hover:border-line focus:border-ring"
                      onChange={(event) => {
                        if (event.target.value) {
                          instantiateSelectedComponent(event.target.value)
                          event.target.value = ''
                        }
                      }}
                    >
                      <option value="">Insert instance…</option>
                      {Object.values(document.components).map((component) => (
                        <option key={component.id} value={component.id}>
                          {component.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Fonts Section */}
                <div className="border-t border-line px-3 py-2 text-xs font-medium text-muted-foreground">Fonts</div>
                <div className="space-y-0.5 px-2 pb-3">
                  {fonts.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">No fonts set yet. Pick one in Typography.</p>
                  ) : fonts.map((font) => (
                    <div key={font.stack} className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/70">
                      <span className="min-w-0 truncate text-sm text-foreground" style={{ fontFamily: font.stack }} title={font.stack}>
                        {font.family}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{font.uses}×</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : leftTab === 'assets' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-3 pt-2.5">
                  <PanelSegment
                    label="Asset kind"
                    value={assetsKind}
                    onChange={setAssetsKind}
                    options={[
                      { value: 'images', label: 'Images' },
                      { value: 'icons', label: 'Icons' },
                    ]}
                  />
                </div>
                <div key={assetsKind} className="app-page-enter flex min-h-0 flex-1 flex-col">
                  {assetsKind === 'images' ? (
                    <AssetsPanel onInsert={(asset) => {
                      const place = placeInsert(240, 160)
                      insertElement('img', { x: place.x, y: place.y }, false, undefined, { src: assetSrc(asset), alt: asset.name }, place.parentId)
                      setLeftTab('design')
                      setTool('select')
                    }} />
                  ) : (
                    <IconsPanel onInsert={insertLibraryIcon} />
                  )}
                </div>
              </div>
            ) : (
              <ThemePanel document={document} transact={transact} />
            )}

          </aside>
        ) : null}

        {/* Canvas Stage & Floating Toolbar */}
        <main
          ref={stageRef}
          style={canvasBg ? { ...stageDots(camera), backgroundColor: canvasBg } : stageDots(camera)}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden bg-surface',
            isPanningActive ? 'cursor-grab active:cursor-grabbing' : tool === 'comment' ? 'cursor-crosshair' : 'cursor-default',
          )}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement)?.closest?.('[role="toolbar"]')) return
            startDrawing(event)
            if (!drawingRef.current) startPan(event)
            if (!drawingRef.current && !dragRef.current) startBodyDrag(event)
          }}
          onPointerMove={(event) => { moveDrawing(event); movePan(event); onDragMove(event) }}
          onPointerUp={(event) => {
            finishDrawing(event)
            finishPan(event)
            // A body drag holds pointer capture on the stage, so the click that
            // follows lands on the stage itself and would clear the selection.
            if (
              event.target === event.currentTarget &&
              dragRef.current?.element &&
              dragRef.current.pointerId === event.pointerId
            ) suppressClickRef.current = true
            finishElementDrag(event)
          }}
          onPointerCancel={(event) => { finishDrawing(event, true); finishPan(event); finishElementDrag(event) }}
          onClick={(event) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            const target = event.target
            if (!(target instanceof Element) || target.closest('[role="toolbar"], button, [role="button"]')) return
            if (tool === 'comment') {
              setThreadNodeId(pickTarget(documentRef.current, webNodeIdFromElement(target)))
              return
            }
            setThreadNodeId(null)
            if (tool === 'select') {
              select(pickTarget(documentRef.current, webNodeIdFromElement(target)))
              return
            }
            if (tool === 'pan') return
            const point = canvasPoint(event)
            if (tool === 'image') {
              setLeftPanelOpen(true)
              setLeftTab('assets')
              setAssetsKind('images')
              return
            }
            if (tool === 'pen') insertPenPath(point)
            else {
              insertElement(tool === 'text' ? 'p' : 'div', point, tool === 'frame')
              if (tool === 'frame') setTool('select')
            }
          }}
          onDoubleClick={(event) => {
            const target = event.target
            if (!(target instanceof Element)) return
            const id = webNodeIdFromElement(target)
            const element = id ? findElement(id) : null
            if (id && element) editText(element, id)
          }}
          onPointerOver={(event) => {
            const target = event.target
            if (!(target instanceof Element)) return
            hover(pickTarget(documentRef.current, webNodeIdFromElement(target)))
          }}
          onPointerLeave={() => hover(null)}
        >
          {/* Vertical Toolbar on the left */}
          {focusMode ? null : (
            <div
              role="toolbar"
              aria-label="Tools"
              data-cuelume-theme="mech"
              className="absolute left-3 top-3 z-30 flex flex-col items-center gap-0.5 rounded-lg border border-line/80 bg-surface/95 p-1 text-foreground shadow-raised backdrop-blur-sm"
            >
              {toolButtons}
            </div>
          )}

          {/* Rendered Document View */}
          <div
            ref={pageBoundsRef}
            data-testid="page-bounds"
            className={cn(
              'absolute origin-top-left',
              // Only a bounded page (an artboard an agent made) has an edge to show.
              // An open page, Page 1 included, is empty until frames are set on it.
              isBoundedPage(document, pageId) && 'shadow-panel-lg',
              isBoundedPage(document, pageId) && pageSelected && 'ring-2 ring-cx-accent',
            )}
            style={{
              width: pageResizePreview?.width ?? boxWidth,
              height: pageResizePreview?.height ?? boxHeight,
              transform: cameraTransform(camera),
            }}
          >
            <WebDocumentView
              document={document}
              visibleRootIds={visibleIds}
              onMaterialize={onMaterialize}
              // The view paints itself white by default so exports and previews have a
              // ground. In the editor the page is the surface behind the frames, so it
              // paints nothing: an empty page is empty.
              className={cn('relative h-full w-full bg-transparent!', isBoundedPage(document, pageId) && 'overflow-hidden')}
            />
            {pageSelected && isBoundedPage(document, pageId) ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <button
                key={corner}
                data-testid="page-corner"
                type="button"
                aria-label={corner === 'se' ? 'Resize page' : `Resize page from ${corner === 'nw' ? 'top left' : corner === 'ne' ? 'top right' : 'bottom left'}`}
                className={cn(
                  'pointer-events-auto absolute z-30 size-10 touch-none',
                  corner === 'nw' && '-left-5 -top-5 cursor-nwse-resize',
                  corner === 'ne' && '-right-5 -top-5 cursor-nesw-resize',
                  corner === 'sw' && '-bottom-5 -left-5 cursor-nesw-resize',
                  corner === 'se' && '-bottom-5 -right-5 cursor-nwse-resize',
                )}
                onPointerDown={(event) => startPageResize(event, corner)}
                onPointerMove={movePageResize}
                onPointerUp={finishPageResize}
                onPointerCancel={(event) => finishPageResize(event, true)}
              >
                <span className="pointer-events-none absolute inset-2 rounded-full border-2 border-cx-accent bg-white shadow-sm" />
              </button>
            )) : null}
          </div>

          {drawing ? (
            drawing.tool === 'pen' ? (
              <svg data-testid="drawing-preview" className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible" aria-hidden="true">
                <polyline
                  points={drawing.points.map((point) => `${camera.x + point.x * camera.zoom},${camera.y + point.y * camera.zoom}`).join(' ')}
                  fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div
                data-testid="drawing-preview"
                className="pointer-events-none absolute z-20 border border-cx-accent bg-cx-accent/15"
                style={{
                  left: camera.x + Math.min(drawing.start.x, drawing.end.x) * camera.zoom,
                  top: camera.y + Math.min(drawing.start.y, drawing.end.y) * camera.zoom,
                  width: Math.max(1, Math.abs(drawing.end.x - drawing.start.x) * camera.zoom),
                  height: Math.max(1, Math.abs(drawing.end.y - drawing.start.y) * camera.zoom),
                }}
              />
            )
          ) : null}

          {/* Hover highlight */}
          {hoverRect && hoveredId !== selectedId ? (
            <div
              className="pointer-events-none absolute border border-cx-accent/50"
              style={hoverRect}
            />
          ) : null}

          {/* One name label above every top-level frame. Grab it to move the
              frame, double-click it to rename. */}
          {frameIds.map((id) => {
            const rect = frameRects[id]
            const node = document.nodes[id]
            if (!rect || node?.kind !== 'element') return null
            const label = nodeLabel(node, document)
            const isSelected = selectedId === id
            return (
              <div
                key={id}
                className={cn(
                  // Opaque on purpose: a backdrop blur here repaints on every pan
                  // frame, which WebKitGTK on Linux in particular cannot keep up with.
                  'pointer-events-auto absolute z-20 flex h-6 max-w-[min(20rem,100%)] items-center gap-1.5 rounded-t-lg px-2 text-[11px] font-mono tracking-tight transition-[background-color,color,box-shadow] duration-150',
                  isSelected
                    ? 'bg-cx-accent font-medium text-cx-accent-foreground shadow-[0_0_0_1px_var(--cx-accent),inset_0_1px_0_rgba(255,255,255,0.25)]'
                    : 'bg-surface text-muted-foreground shadow-raised hover:text-foreground',
                )}
                style={{ left: rect.left, top: rect.top - 24 }}
              >
                {renamingFrameId === id ? (
                  <input
                    autoFocus
                    aria-label="Frame name"
                    defaultValue={node.attributes[NAME_ATTRIBUTE] ?? label}
                    className="h-4.5 w-36 rounded bg-surface px-1.5 text-[11px] text-foreground shadow-sunken outline-none"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={(event) => {
                      setRenamingFrameId(null)
                      const value = event.currentTarget.value.trim()
                      if (value && value !== label) renameNode(id, value)
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = label
                        setRenamingFrameId(null)
                      }
                    }}
                  />
                ) : (
                  <div
                    className="flex min-w-0 cursor-move select-none items-center gap-1.5 truncate"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      select(id)
                      startElementDrag(event, 'move')
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={finishElementDrag}
                    onPointerCancel={finishElementDrag}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      setRenamingFrameId(id)
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <span className={cn('text-[9px] opacity-80', isSelected ? 'text-white/90' : 'text-muted-foreground')}>
                      {Math.round(rect.width / camera.zoom)} × {Math.round(rect.height / camera.zoom)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Selection Rect & Handles */}
          {selectionRect ? (
            <div
              className="pointer-events-none absolute border border-cx-accent"
              style={selectionRect}
            >
              {/* Move handle */}
              {bound ? (
                <div className="pointer-events-auto absolute -top-5 left-0 max-w-48 truncate rounded-sm bg-violet-600 px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {selectedNode ? nodeLabel(selectedNode, document) : ''} · instance
                </div>
              ) : selectedId !== null && frameIds.includes(selectedId) ? null : (
                <div
                  className="pointer-events-auto absolute -top-5 left-0 max-w-48 cursor-move truncate rounded-sm bg-cx-accent px-1.5 py-0.5 font-mono text-[10px] text-white opacity-0 transition-opacity hover:opacity-100"
                  onPointerDown={(event) => startElementDrag(event, 'move')}
                  onPointerMove={onDragMove}
                  onPointerUp={finishElementDrag}
                  onPointerCancel={finishElementDrag}
                >
                  {selectedNode ? nodeLabel(selectedNode, document) : ''}
                </div>
              )}

              {/* Eight resize handles */}
              {bound ? null : RESIZE_HANDLES.map((handle) => (
                <div
                  key={handle.id}
                  role="button"
                  aria-label={handle.id === 'se' ? 'Resize element' : `Resize from ${handle.label}`}
                  tabIndex={0}
                  className={cn(
                    'pointer-events-auto absolute z-10 size-2.5 rounded-[2px] border-[1.5px] border-cx-accent bg-white shadow-sm ring-1 ring-black/10 transition-transform hover:scale-125',
                    handle.position,
                    handle.cursor,
                  )}
                  onPointerDown={(event) => startElementDrag(event, 'resize', handle.edges)}
                  onPointerMove={onDragMove}
                  onPointerUp={finishElementDrag}
                  onPointerCancel={finishElementDrag}
                />
              ))}

              {/* Dimensions badge at bottom center */}
              <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-cx-accent px-2 py-0.5 font-mono text-[10px] font-medium text-white shadow-md ring-1 ring-white/20">
                {Math.round(selectionRect.width / camera.zoom)} × {Math.round(selectionRect.height / camera.zoom)}
              </div>
            </div>
          ) : null}

          {/* The agent's current target, ringed while it works */}
          {agentActivity
            ? agentNodeIds.map((nodeId) => {
                const rect = pinRects[nodeId]
                if (!rect) return null
                return (
                  <div
                    key={nodeId}
                    aria-hidden="true"
                    className="cx-agent-ring pointer-events-none z-20"
                    data-phase={agentActivity.phase}
                    style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                  />
                )
              })
            : null}

          {/* Comment pins and the open thread */}
          {openCommentNodeIds.map((nodeId) => {
            const rect = pinRects[nodeId]
            if (!rect) return null
            return (
              <CommentPin
                key={nodeId}
                rect={rect}
                count={comments.filter((comment) => comment.nodeId === nodeId && !comment.resolved).length}
                active={threadNodeId === nodeId}
                onOpen={() => setThreadNodeId((current) => (current === nodeId ? null : nodeId))}
              />
            )
          })}
          {threadNodeId ? (
            <CommentThread
              key={threadNodeId}
              rect={pinRects[threadNodeId] ?? null}
              bounds={{
                width: stageRef.current?.clientWidth ?? 0,
                height: stageRef.current?.clientHeight ?? 0,
              }}
              nodeLabel={
                document.nodes[threadNodeId]
                  ? nodeLabel(document.nodes[threadNodeId], document)
                  : comments.find((comment) => comment.nodeId === threadNodeId)?.nodeLabel ?? 'Deleted element'
              }
              comments={comments.filter((comment) => comment.nodeId === threadNodeId)}
              onClose={() => setThreadNodeId(null)}
              onSubmit={(body) => {
                const node = document.nodes[threadNodeId]
                const label = node ? nodeLabel(node, document) : 'Element'
                return createComment(threadNodeId, label, body)
              }}
              onResolve={resolveComment}
              onDelete={removeComment}
            />
          ) : null}

          {/* Empty Canvas Starter Plate */}
          {frameIds.length === 0 && layerIds.length === 0 ? (
            <div
              className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl bg-surface p-6 text-center shadow-panel-lg"
            >
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-cx-accent/10 text-cx-accent shadow-xs">
                <FrameIcon className="size-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Canvas is ready</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Select a preset to place your first frame, or press <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">F</kbd> to draw
              </p>
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                {[
                  { name: 'iPhone 16', width: 393, height: 852 },
                  { name: 'MacBook Pro 14″', width: 1512, height: 982 },
                  { name: 'Slide 16:9', width: 1920, height: 1080 },
                  { name: 'Square Artboard', width: 1080, height: 1080 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => insertFrame(preset)}
                    className="cx-tile flex flex-col items-start rounded-xl bg-surface p-2.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate text-xs font-medium text-foreground">{preset.name}</span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      {preset.width} × {preset.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Floating Viewport & Zoom Controller Dock */}
          <div
            role="region"
            aria-label="Canvas zoom and view controls"
            className="absolute bottom-4 end-4 z-30 flex items-center gap-1 rounded-lg border border-line/80 bg-surface/95 p-1 text-foreground shadow-raised backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              className={ZOOM_KEY}
              onClick={() => zoomStage(0.85)}
            >
              <MinusIcon className="size-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Zoom presets"
                title="Select zoom level"
                aria-expanded={zoomMenuOpen}
                className="flex h-7 min-w-12 items-center justify-center rounded-md px-2 font-mono text-[11px] font-medium tabular-nums text-foreground outline-none transition-[background-color,scale] duration-150 ease-smooth hover:bg-accent active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-accent"
                onClick={() => setZoomMenuOpen((open) => !open)}
              >
                {Math.round(camera.zoom * 100)}%
              </button>
              {zoomMenuOpen ? (
                <div
                  className="app-page-enter absolute bottom-full end-0 z-40 mb-2 w-36 origin-bottom-right rounded-xl bg-popover p-1 text-foreground shadow-panel-lg"
                >
                  {[
                    { label: '50%', zoom: 0.5 },
                    { label: '100% · 1:1', zoom: 1 },
                    { label: '200%', zoom: 2 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="flex h-7 w-full items-center justify-between rounded-lg px-2 text-xs text-foreground transition-colors hover:bg-accent hover:text-cx-accent"
                      onClick={() => {
                        setExactZoom(preset.zoom)
                        setZoomMenuOpen(false)
                      }}
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                  <div className="my-1 h-px bg-line/80" />
                  <button
                    type="button"
                    className="flex h-7 w-full items-center justify-between rounded-lg px-2 text-xs text-foreground transition-colors hover:bg-accent hover:text-cx-accent"
                    onClick={() => {
                      fitToView()
                      setZoomMenuOpen(false)
                    }}
                  >
                    <span>Fit to view</span>
                    <kbd className="font-sans text-[10px] tabular-nums text-muted-foreground">{shortcutLabel('zoomToFit')}</kbd>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              className={ZOOM_KEY}
              onClick={() => zoomStage(1.15)}
            >
              <PlusIcon className="size-3.5" />
            </button>

            <div className="mx-0.5 h-4 w-px bg-line/80" />

            <button
              type="button"
              aria-label="Fit to canvas"
              title={`Fit to canvas (${shortcutLabel('zoomToFit')})`}
              className={ZOOM_KEY}
              onClick={fitToView}
            >
              <CropIcon className="size-3.5" />
            </button>

            <button
              type="button"
              aria-label={focusMode ? 'Exit focus mode (\\)' : 'Focus mode / Zen canvas (\\)'}
              aria-pressed={focusMode}
              title={focusMode ? 'Exit focus mode (\\)' : 'Focus mode / Zen canvas (\\)'}
              className={cn(
                'flex size-7 items-center justify-center rounded-md outline-none transition-[background-color,color,scale] duration-150 ease-smooth active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-ring',
                focusMode
                  ? 'bg-cx-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]'
                  : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground',
              )}
              onClick={toggleFocusMode}
            >
              <MaximizeIcon className="size-3.5" />
            </button>
          </div>
        </main>

        {/* Right Inspector Panel: Design */}
        {rightPanelOpen ? (
        <aside
          aria-label="Design"
          className={cn(
            'relative flex min-h-0 min-w-0 flex-col border-s border-line bg-surface text-foreground',
            isCompact && 'absolute inset-y-0 end-0 z-40 w-80 shadow-panel-lg',
          )}
        >
          {isCompact ? null : (
            <PanelResizer side="right" width={rightWidth} fallback={288} onResize={setRightWidth} label="Resize design panel" />
          )}
          <PanelTabs
            label="Right panel"
            value={rightTab}
            onChange={setRightTab}
            options={[
              { value: 'design', label: tool === 'frame' ? 'Frame' : 'Design' },
              {
                value: 'comments',
                label: 'Comments',
                badge: openCommentNodeIds.length > 0 ? (
                  <span className="min-w-4 rounded-full bg-cx-accent px-1 text-center text-[10px] font-medium tabular-nums leading-4 text-white">
                    {openCommentNodeIds.length}
                  </span>
                ) : undefined,
              },
            ]}
            trailing={
              rightTab === 'design' && tool !== 'frame' && selectedId ? (
                <button
                  type="button"
                  disabled={saveStatus === 'saving'}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-[background-color,color] duration-150 hover:bg-destructive/10 hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                  onClick={deleteSelected}
                  title="Delete element (Del)"
                  aria-label="Delete selected element"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              ) : null
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            {rightTab === 'comments' ? (
              <CommentsList
                comments={comments}
                onSelectNode={(nodeId) => {
                  if (document.nodes[nodeId]) select(nodeId)
                  setThreadNodeId(nodeId)
                }}
                onResolve={resolveComment}
                onDelete={removeComment}
              />
            ) : tool === 'frame' ? <FramePresetsPanel onPick={insertFrame} /> : (
            <WebInspector
              node={selectedNode}
              geometry={selectionRect ? {
                left: (selectionRect.left - camera.x) / camera.zoom,
                top: (selectionRect.top - camera.y) / camera.zoom,
                width: selectionRect.width / camera.zoom,
                height: selectionRect.height / camera.zoom,
              } : null}
              computed={computed}
              matchingRules={matchingRules}
              bound={bound}
              override={selectedOverride}
              pageBackground={isBoundedPage(document, pageId)
                ? pageBackground
                : (canvasBg ?? (globalThis.document?.documentElement.classList.contains('dark') ? '#272727' : '#ffffff'))}
              boundedPage={isBoundedPage(document, pageId)}
              pageSize={pageResizePreview ?? { width: canvasWidth, height: canvasHeight }}
              fonts={fonts}
              selectionColors={selectionColors}
              onReplaceColor={replaceSelectionColor}
              onSetPageBackground={(color) => {
                const id = pageIdRef.current
                if (!isBoundedPage(documentRef.current, id)) {
                  // An open page has no paint of its own; the colour is the surface behind its frames.
                  if (!CANVAS_BG_PATTERN.test(color)) return
                  transact('Set page colour', [{ type: 'page.setStage', pageId: id, color }])
                  return
                }
                if (id !== null && documentRef.current.nodes[id]?.kind === 'element') {
                  transact('Set page background', [{ type: 'node.patch', id, patch: { kind: 'element', styles: { background: color } } }])
                }
              }}
              onResizePage={resizePage}
              onConnectAgent={() => setConnectAgentOpen(true)}
              onPatch={patchSelected}
              onPatchRule={patchRule}
              onSetOverride={setSelectedOverride}
              onClearOverride={clearSelectedOverride}
              onDeleteInstance={deleteSelectedInstance}
            />
            )}
          </div>
          <div className="flex shrink-0 justify-start p-1.5">
            <button
              type="button"
              aria-label="Close panel"
              title="Close panel"
              data-cuelume-tap=""
              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 ease-smooth hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.92]"
              onClick={() => setRightPanelOpen(false)}
            >
              <ChevronRightIcon className="size-3.5" />
            </button>
          </div>
        </aside>
        ) : null}
      </div>

      <ShaderGallery open={shadersOpen} onOpenChange={setShadersOpen} onPick={insertShader} />

      {/* Connect Agent Dialog */}
      <Dialog open={connectAgentOpen} onOpenChange={setConnectAgentOpen}>
        <DialogPopup className="max-w-xl bg-surface text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base">Connect your agent</DialogTitle>
            <DialogDescription className="text-xs">
              Sheet runs a local MCP server. Pick your agent and follow the steps.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
            <ConnectAgent />
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  )
}
