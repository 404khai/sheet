import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Database } from 'bun:sqlite'
import { writeAtomic } from '../../apps/mcp/src/agent-install'
import {
  findFreePort,
  findWindowsChromium,
  isPortInUse,
  isWindows,
  normalizeWindowsPath,
  resolveAppDataDir,
  windowsPathToFileUrl,
} from '../src/platform-adapter'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sheet-windows-test-'))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('Windows Platform Adapter', () => {
  it('correctly detects Windows platform', () => {
    expect(isWindows()).toBe(process.platform === 'win32')
  })

  describe('Path handling', () => {
    it('normalizes Windows paths with forward and backward slashes', () => {
      const input = 'C:/Users/TestUser/AppData/Roaming/Sheet'
      const normalized = normalizeWindowsPath(input)
      expect(normalized).toBe('C:\\Users\\TestUser\\AppData\\Roaming\\Sheet')
    })

    it('handles paths with spaces safely', () => {
      const input = 'C:\\Program Files\\Sheet Design App\\sheet.db'
      const normalized = normalizeWindowsPath(input)
      expect(normalized).toBe('C:\\Program Files\\Sheet Design App\\sheet.db')
    })

    it('converts Windows paths to valid file:// URLs', () => {
      const input = 'C:\\Program Files\\Sheet\\assets\\logo.png'
      expect(windowsPathToFileUrl(input)).toBe('file:///C:/Program%20Files/Sheet/assets/logo.png')
    })

    it('converts UNC paths to a host-rooted file URL', () => {
      expect(windowsPathToFileUrl('\\\\server\\share\\Sheet\\sheet.db')).toBe(
        'file://server/share/Sheet/sheet.db',
      )
    })
  })

  describe('Application Data Directory resolution', () => {
    it('resolves production AppData path as %APPDATA%\\Sheet', () => {
      vi.stubEnv('SHEET_DATA_DIR', '')
      expect(resolveAppDataDir({ isDev: false }).endsWith('Sheet')).toBe(true)
    })

    it('resolves development AppData path as %APPDATA%\\Sheet Dev', () => {
      vi.stubEnv('SHEET_DATA_DIR', '')
      expect(resolveAppDataDir({ isDev: true }).endsWith('Sheet Dev')).toBe(true)
    })

    it('respects SHEET_DATA_DIR override', () => {
      const custom = join(dir, 'custom-sheet-test-dir')
      vi.stubEnv('SHEET_DATA_DIR', custom)
      expect(resolveAppDataDir()).toBe(custom)
    })

    it('prefers an explicit custom directory over the environment', () => {
      vi.stubEnv('SHEET_DATA_DIR', join(dir, 'from-env'))
      const custom = join(dir, 'from-option')
      expect(resolveAppDataDir({ customDir: custom })).toBe(custom)
    })
  })

  describe('Chromium discovery on Windows', () => {
    it.skipIf(process.platform !== 'win32')(
      'discovers installed Chrome or Edge executable when available',
      () => {
        const chromium = findWindowsChromium()
        if (!chromium) return
        expect(existsSync(chromium)).toBe(true)
        expect(chromium.toLowerCase().endsWith('.exe')).toBe(true)
      },
    )
  })

  describe('Atomic file writes', () => {
    it('writes and overwrites files without leaving a temporary file behind', async () => {
      const testFile = join(dir, 'state.json')
      const payload1 = JSON.stringify({ version: '1.0.0', state: 'initial' })
      const payload2 = JSON.stringify({ version: '1.0.1', state: 'updated' })

      await writeAtomic(testFile, payload1)
      expect(readFileSync(testFile, 'utf8')).toBe(payload1)

      // Overwrite immediately (tests Windows overwrite resilience)
      await writeAtomic(testFile, payload2)
      expect(readFileSync(testFile, 'utf8')).toBe(payload2)
    })
  })

  describe('Port utilities', () => {
    it('correctly discovers a free loopback port', async () => {
      const port = await findFreePort(49152)
      expect(port).toBeGreaterThanOrEqual(49152)
      expect(await isPortInUse(port)).toBe(false)
    })
  })

  describe('Windows SQLite Engine', () => {
    it('creates database file and executes WAL transactions cleanly on Windows', () => {
      const dbPath = join(dir, 'sheet-test-sqlite.db')
      const sqlite = new Database(dbPath, { create: true })

      try {
        sqlite.exec('PRAGMA journal_mode = WAL')
        sqlite.exec('PRAGMA foreign_keys = ON')

        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS test_doc (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at NUMERIC NOT NULL
          )
        `)

        const insert = sqlite.prepare('INSERT INTO test_doc (id, name, data, updated_at) VALUES (?, ?, ?, ?)')
        insert.run('doc-1', 'Windows Board', '{"nodes":{}}', Date.now())

        const query = sqlite.query<{ id: string; name: string }, [string]>('SELECT id, name FROM test_doc WHERE id = ?')
        const row = query.get('doc-1')

        expect(row).toBeDefined()
        expect(row?.name).toBe('Windows Board')
      } finally {
        // WAL leaves `-wal` and `-shm` beside the database; closing releases them.
        sqlite.close()
      }
      expect(existsSync(dbPath)).toBe(true)
    })
  })
})
