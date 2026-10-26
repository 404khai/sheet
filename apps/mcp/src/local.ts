import { RPCHandler } from '@orpc/server/fetch'
import { and, eq } from 'drizzle-orm'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { LOCAL_USER_ID, db, ensureLocalUser } from '@sheet/db'
import { asset } from '@sheet/db/schema'
import { appRouter } from '@sheet/rpc'
import { buildHandoffPayload } from '@sheet/rpc/handoff'
import { readHandoffToken } from '@sheet/rpc/handoff-token'
import {
  messageTargetsRoom,
  subscribeLocalEvents,
} from '@sheet/realtime/local-bus'
import { completeCapture, registerCapturer, type CaptureResult } from '@sheet/rpc/capture-broker'
import { installAgent, isInstallableAgent } from './agent-install'
import { configFrom } from './config'
import { installSkill } from './skill-install'
import { createAppState, handleRequest } from './handler'

/**
 * The local Sheet server. One Bun process serves everything the desktop
 * window and local MCP clients need:
 *
 * - `POST /mcp` — the MCP JSON-RPC endpoint (no auth, local user)
 * - `/api/rpc/*` — the oRPC router the editor talks to
 * - `/api/asset/:id` — image bytes from the asset table
 * - `/api/handoff/:token` (+ `/asset/:id`) — agent handoff payloads
 * - `/api/canvas-events` — live canvas/branch/agent events over SSE,
 *   backed by the in-process bus (no socket service, no Redis)
 *
 * With `SHEET_APP_DIR` set (the portable Windows bundle, or any build of the
 * interface) it also serves the built interface from disk, so a browser can
 * open the canvas without the Tauri host.
 *
 * The Tauri host spawns this on startup; `bun run dev:mcp` runs it directly.
 */

const LOCAL_SESSION_ID = 'local'

/** The built interface, when this process is also the web server. */
const appDirEnv = process.env.SHEET_APP_DIR?.trim()
const appDir = appDirEnv ? resolve(appDirEnv) : null

const APP_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Serves one file from the built interface. Routes without an extension fall
 * back to `index.html` so client-side navigation keeps working on refresh.
 */
async function serveAppFile(pathname: string) {
  if (!appDir) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return new Response('Bad path', { status: 400 })
  }
  if (decoded.includes('\0')) return new Response('Bad path', { status: 400 })
  const file = resolve(appDir, `.${decoded}`)
  const inside = relative(appDir, file)
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return new Response('Not found', { status: 404 })
  }
  const target = extname(file) ? file : join(appDir, 'index.html')
  const body = Bun.file(target)
  if (!(await body.exists())) return null
  return new Response(body, {
    headers: {
      'content-type': APP_CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': extname(file) ? 'no-cache' : 'no-store',
    },
  })
}

const rpc = new RPCHandler(appRouter)

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function serveAsset(id: string) {
  const [row] = await db
    .select({ mediaType: asset.mediaType, size: asset.size, data: asset.data })
    .from(asset)
    .where(and(eq(asset.id, id), eq(asset.userId, LOCAL_USER_ID)))
    .limit(1)
  if (!row?.data) return new Response('Not found', { status: 404 })
  const bytes = Buffer.from(row.data, 'base64')
  return new Response(bytes, {
    headers: {
      'content-type': row.mediaType,
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=86400',
    },
  })
}

async function serveHandoffAsset(token: string, id: string) {
  const claims = await readHandoffToken(token)
  if (!claims) return new Response('Not found', { status: 404 })
  const [row] = await db
    .select({ mediaType: asset.mediaType, data: asset.data })
    .from(asset)
    .where(and(eq(asset.id, id), eq(asset.userId, claims.userId)))
    .limit(1)
  if (!row?.data) return new Response('Not found', { status: 404 })
  const bytes = Buffer.from(row.data, 'base64')
  return new Response(bytes, {
    headers: {
      'content-type': row.mediaType,
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=86400',
    },
  })
}

function serveCanvasEvents(request: Request) {
  const url = new URL(request.url)
  const designId = url.searchParams.get('designId') ?? ''
  const draftId = url.searchParams.get('draftId')
  let closed = false
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(new TextEncoder().encode(chunk))
      }
      send(
        sseEvent('ready', {
          type: 'ready',
          sessionId: LOCAL_SESSION_ID,
          role: 'owner',
          peers: [],
          activity: null,
          sentAt: Date.now(),
        }),
      )
      const unsubscribe = subscribeLocalEvents((message) => {
        if (!messageTargetsRoom(message, designId, draftId)) return
        send(sseEvent('canvas', { ...message.event, sentAt: message.sentAt }))
      })
      const heartbeat = setInterval(() => send(':keepalive\n\n'), 20_000)
      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        controller.close()
      })
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  })
}

function isLoopbackOrigin(origin: string) {
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol === 'tauri:') return true
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * Writes the Sheet MCP entry into an agent's own config file. It edits files
 * outside the app, so a page on another origin must never be able to call it.
 */
function blockedOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin === null || isLoopbackOrigin(origin)) return null
  return Response.json({ ok: false, message: 'Blocked: request came from a non-local origin.' }, { status: 403 })
}

/** The app window listens here and renders screenshots on request. */
function serveCaptureEvents(request: Request) {
  const blocked = blockedOrigin(request)
  if (blocked) return blocked
  let unregister = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(new TextEncoder().encode(chunk))
      }
      send(sseEvent('ready', { sentAt: Date.now() }))
      unregister = registerCapturer({ send: (capture) => send(sseEvent('capture', capture)) })
      heartbeat = setInterval(() => send(':keepalive\n\n'), 20_000)
      request.signal.addEventListener('abort', () => {
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        unregister()
        controller.close()
      })
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' },
  })
}

function parseTimings(raw: string | null) {
  const timings: Record<string, number> = {}
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) if (typeof value === 'number') timings[key] = value
    }
  } catch {
    // Timings are advisory.
  }
  return timings
}

/** The window posts the rendered image (body) or an error (`?error=`) for one request id. */
async function serveCaptureResult(request: Request, url: URL) {
  const blocked = blockedOrigin(request)
  if (blocked) return blocked
  const id = url.searchParams.get('id') ?? ''
  const error = url.searchParams.get('error')
  const width = Number(url.searchParams.get('width'))
  const height = Number(url.searchParams.get('height'))
  const mime = url.searchParams.get('mime')
  const result: CaptureResult = error
    ? { ok: false, message: error }
    : (mime === 'image/png' || mime === 'image/jpeg') && width > 0 && height > 0
      ? { ok: true, bytes: new Uint8Array(await request.arrayBuffer()), mimeType: mime, width, height, timings: parseTimings(url.searchParams.get('timings')) }
      : { ok: false, message: 'The window sent an unreadable screenshot.' }
  return Response.json({ ok: completeCapture(id, result) }, { headers: { 'cache-control': 'no-store' } })
}

const IMAGE_PROXY_MAX_BYTES = 8 * 1024 * 1024

function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80') ||
    /^(127|10|0)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

/**
 * Lets the window read images from other origins while rendering a screenshot.
 * Public http(s) hosts only, no redirects: it fetches on the user's behalf.
 */
async function serveCaptureImage(request: Request, url: URL) {
  const blocked = blockedOrigin(request)
  if (blocked) return blocked
  let target: URL
  try {
    target = new URL(url.searchParams.get('url') ?? '')
  } catch {
    return new Response('Bad image URL', { status: 400 })
  }
  if ((target.protocol !== 'https:' && target.protocol !== 'http:') || privateHost(target.hostname)) {
    return new Response('That image URL is not allowed', { status: 400 })
  }
  try {
    const upstream = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !type.startsWith('image/')) return new Response('Not an image', { status: 502 })
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    if (bytes.byteLength > IMAGE_PROXY_MAX_BYTES) return new Response('Image too large', { status: 413 })
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'private, max-age=300' } })
  } catch {
    return new Response('Could not fetch the image', { status: 502 })
  }
}

async function serveSkillInstall(request: Request) {
  const blocked = blockedOrigin(request)
  if (blocked) return blocked
  const entries = await installSkill()
  const failed = entries.some((entry) => entry.status === 'failed')
  return Response.json({ ok: !failed, entries }, { status: failed ? 500 : 200, headers: { 'cache-control': 'no-store' } })
}

async function serveAgentInstall(request: Request) {
  const blocked = blockedOrigin(request)
  if (blocked) return blocked
  const body: unknown = await request.json().catch(() => null)
  const agent = typeof body === 'object' && body !== null && 'agent' in body ? body.agent : null
  if (!isInstallableAgent(agent)) {
    return Response.json({ ok: false, message: 'Unknown agent.' }, { status: 400 })
  }
  const result = await installAgent(agent, `http://127.0.0.1:${config.port}/mcp`)
  return Response.json(result, { status: result.ok ? 200 : 500, headers: { 'cache-control': 'no-store' } })
}

async function route(request: Request, state: ReturnType<typeof createAppState>) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/mcp' || path === '/ready' || path === '/health' || (path === '/' && !appDir)) {
    return handleRequest(request, state)
  }
  if (path.startsWith('/api/rpc')) {
    const result = await rpc.handle(request, {
      prefix: '/api/rpc',
      context: { request },
    })
    if (result.matched) return result.response
    return new Response('Not found', { status: 404 })
  }
  if (path.startsWith('/api/asset/')) {
    return serveAsset(decodeURIComponent(path.slice('/api/asset/'.length)))
  }
  const handoffAsset = /^\/api\/handoff\/([^/]+)\/asset\/([^/]+)$/.exec(path)
  if (handoffAsset) {
    return serveHandoffAsset(
      decodeURIComponent(handoffAsset[1]!),
      decodeURIComponent(handoffAsset[2]!),
    )
  }
  const handoff = /^\/api\/handoff\/([^/]+)$/.exec(path)
  if (handoff && request.method === 'GET') {
    const payload = await buildHandoffPayload(
      decodeURIComponent(handoff[1]!),
      url.origin,
    )
    if (!payload) return new Response('Not found', { status: 404 })
    return Response.json(payload, { headers: { 'cache-control': 'no-store' } })
  }
  if (path === '/api/handoff' && request.method === 'GET') {
    return new Response('Not found', { status: 404 })
  }
  if (path === '/api/agent-install' && request.method === 'POST') {
    return serveAgentInstall(request)
  }
  if (path === '/api/capture-events' && request.method === 'GET') {
    return serveCaptureEvents(request)
  }
  if (path === '/api/capture-image' && request.method === 'GET') {
    return serveCaptureImage(request, url)
  }
  if (path === '/api/capture-result' && request.method === 'POST') {
    return serveCaptureResult(request, url)
  }
  if (path === '/api/skill-install' && request.method === 'POST') {
    return serveSkillInstall(request)
  }
  if (path === '/api/realtime-ticket') {
    // No socket service locally — the client falls back to the event stream.
    return Response.json(
      { error: 'No socket service here' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
  if (path === '/api/canvas-events' && request.method === 'GET') {
    return serveCanvasEvents(request)
  }
  if (path === '/api/canvas-presence' && request.method === 'POST') {
    return Response.json(
      { sessionId: LOCAL_SESSION_ID },
      { headers: { 'cache-control': 'no-store' } },
    )
  }
  if (path.startsWith('/api/')) return new Response('Not found', { status: 404 })
  if (request.method === 'GET' || request.method === 'HEAD') {
    const asset = await serveAppFile(path)
    if (asset) return asset
  }
  return new Response('Not found', { status: 404 })
}

const config = configFrom((key) => process.env[key])
const state = createAppState(config)

await ensureLocalUser()

const server = Bun.serve({
  port: config.port,
  fetch: (request, server) => {
    // Bun closes connections idle for 10s; a quiet event stream is idle by design.
    const { pathname } = new URL(request.url)
    if (pathname === '/api/canvas-events' || pathname === '/api/capture-events') server.timeout(request, 0)
    return route(request, state)
  },
})

console.info(`Sheet local server listening on http://localhost:${server.port}`)
console.info(`MCP endpoint: http://localhost:${server.port}/mcp`)
