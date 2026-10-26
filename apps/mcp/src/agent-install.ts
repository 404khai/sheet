import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'

export const INSTALLABLE_AGENTS = [
  'cursor',
  'claude-code',
  'vscode',
  'github-copilot',
  'opencode',
  'codex',
  'antigravity',
] as const

export type InstallableAgent = (typeof INSTALLABLE_AGENTS)[number]

export type InstallResult =
  | { ok: true; path: string; status: 'installed' | 'updated' | 'already-installed' }
  | { ok: false; reason: 'unreadable-config' | 'write-failed'; path: string; message: string }

export function isInstallableAgent(value: unknown): value is InstallableAgent {
  return INSTALLABLE_AGENTS.some((agent) => agent === value)
}

const SERVER_NAME = 'sheet'

function vscodeUserDir(home: string) {
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Code', 'User')
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Code', 'User')
  return join(home, '.config', 'Code', 'User')
}

type JsonTarget = {
  path: string
  /** Top-level key that holds the server map. */
  key: string
  entry: Record<string, unknown>
  seed?: Record<string, unknown>
}

function jsonTarget(agent: Exclude<InstallableAgent, 'codex'>, home: string, url: string): JsonTarget {
  switch (agent) {
    case 'cursor':
      return { path: join(home, '.cursor', 'mcp.json'), key: 'mcpServers', entry: { url } }
    case 'claude-code':
      return { path: join(home, '.claude.json'), key: 'mcpServers', entry: { type: 'http', url } }
    case 'vscode':
    case 'github-copilot':
      return { path: join(vscodeUserDir(home), 'mcp.json'), key: 'servers', entry: { type: 'http', url } }
    case 'opencode':
      return {
        path: join(home, '.config', 'opencode', 'opencode.json'),
        key: 'mcp',
        entry: { type: 'remote', url, enabled: true },
        seed: { $schema: 'https://opencode.ai/config.json' },
      }
    case 'antigravity':
      return {
        path: join(home, '.gemini', 'antigravity', 'mcp_config.json'),
        key: 'mcpServers',
        entry: { serverUrl: url },
      }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function readText(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** Windows returns these while an indexer or an antivirus scan holds the file. */
const LOCK_CODES = new Set(['EBUSY', 'EACCES', 'EPERM'])
const REPLACE_ATTEMPTS = 5

function isLockError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    LOCK_CODES.has(error.code)
  )
}

/**
 * Renames over the target, retrying while Windows holds a transient lock on it.
 * The target is never removed first: a failed replacement has to leave the
 * previous configuration exactly where it was.
 */
async function replaceFile(temp: string, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temp, path)
      return
    } catch (error) {
      if (!isLockError(error) || attempt + 1 >= REPLACE_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt))
    }
  }
}

/**
 * Write beside the target, then rename, so a crash never leaves half a config.
 * Each call writes its own exclusively created temporary file, so concurrent
 * installs cannot publish each other's content.
 */
export async function writeAtomic(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.sheet-${process.pid}-${randomUUID()}.tmp`
  const handle = await open(temp, 'wx')
  try {
    try {
      await handle.writeFile(text, 'utf8')
    } finally {
      await handle.close()
    }
    await replaceFile(temp, path)
  } finally {
    await rm(temp, { force: true }).catch(() => {})
  }
}

async function installJson(target: JsonTarget): Promise<InstallResult> {
  let root: Record<string, unknown> = { ...target.seed }
  try {
    const text = await readText(target.path)
    if (text !== null && text.trim() !== '') {
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed)) throw new Error('top-level value is not an object')
      root = parsed
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'unreadable-config',
      path: target.path,
      message: `Could not read ${target.path} as JSON (${error instanceof Error ? error.message : 'unknown error'}). The file was left untouched. Fix or remove it, then try again.`,
    }
  }

  const servers = isRecord(root[target.key]) ? root[target.key] : {}
  const current = isRecord(servers) ? servers[SERVER_NAME] : undefined
  if (JSON.stringify(current) === JSON.stringify(target.entry)) {
    return { ok: true, path: target.path, status: 'already-installed' }
  }
  root[target.key] = { ...(isRecord(servers) ? servers : {}), [SERVER_NAME]: target.entry }

  try {
    await writeAtomic(target.path, `${JSON.stringify(root, null, 2)}\n`)
  } catch (error) {
    return writeFailed(target.path, error)
  }
  return { ok: true, path: target.path, status: current !== undefined ? 'updated' : 'installed' }
}

async function installCodex(home: string, url: string): Promise<InstallResult> {
  const path = join(home, '.codex', 'config.toml')
  try {
    const text = (await readText(path)) ?? ''
    if (/^\s*\[mcp_servers\.sheet\]/m.test(text)) {
      return { ok: true, path, status: 'already-installed' }
    }
    const separator = text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n'
    await writeAtomic(path, `${text}${separator}[mcp_servers.${SERVER_NAME}]\nurl = "${url}"\n`)
    return { ok: true, path, status: 'installed' }
  } catch (error) {
    return writeFailed(path, error)
  }
}

function writeFailed(path: string, error: unknown): InstallResult {
  return {
    ok: false,
    reason: 'write-failed',
    path,
    message: `Could not write ${path} (${error instanceof Error ? error.message : 'unknown error'}). Nothing was changed. Check the folder's permissions, then try again.`,
  }
}

/** Adds the local Sheet MCP server to the agent's own user-level MCP config. */
export function installAgent(agent: InstallableAgent, mcpUrl: string, home = homedir()) {
  if (agent === 'codex') return installCodex(home, mcpUrl)
  return installJson(jsonTarget(agent, home, mcpUrl))
}
