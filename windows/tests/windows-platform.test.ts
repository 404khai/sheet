import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Database } from 'bun:sqlite'
import {
  findFreePort,
  findWindowsChromium,
  isPortInUse,
  isWindows,
  normalizeWindowsPath,
  resolveAppDataDir,
  safeWriteAtomic,
  windowsPathToFileUrl,
} from '../src/platform-adapter'

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
      expect(normalized).toContain('Program Files')
      expect(normalized).toContain('Sheet Design App')
    })

    it('converts Windows paths to valid file:// URLs', () => {
      const input = 'C:\\Program Files\\Sheet\\assets\\logo.png'
      const url = windowsPathToFileUrl(input)
      expect(url.startsWith('file:///')).toBe(true)
      expect(url).toContain('Program%20Files')
      expect(url).toContain('logo.png')
    })
  })

  describe('Application Data Directory resolution', () => {
    it('resolves production AppData path as %APPDATA%\\Sheet', () => {
      const resolved = resolveAppDataDir({ isDev: false })
      expect(resolved.endsWith('Sheet')).toBe(true)
    })

    it('resolves development AppData path as %APPDATA%\\Sheet Dev', () => {
      const resolved = resolveAppDataDir({ isDev: true })
      expect(resolved.endsWith('Sheet Dev')).toBe(true)
    })

    it('respects SHEET_DATA_DIR override', () => {
      const custom = join(tmpdir(), 'custom-sheet-test-dir')
      process.env.SHEET_DATA_DIR = custom
      try {
        const resolved = resolveAppDataDir()
        expect(resolved).toBe(custom)
      } finally {
        delete process.env.SHEET_DATA_DIR
      }
    })
  })

  describe('Chromium discovery on Windows', () => {
    it('discovers installed Chrome or Edge executable when available', () => {
      const chromium = findWindowsChromium()
      if (chromium) {
        expect(existsSync(chromium)).toBe(true)
        expect(chromium.toLowerCase().endsWith('.exe')).toBe(true)
      }
    })
  })

  describe('Safe Atomic File Writes', () => {
    it('writes and overwrites files atomically without lock errors', async () => {
      const testFile = join(tmpdir(), `sheet-atomic-test-${Date.now()}.json`)
      const payload1 = JSON.stringify({ version: '1.0.0', state: 'initial' })
      const payload2 = JSON.stringify({ version: '1.0.1', state: 'updated' })

      await safeWriteAtomic(testFile, payload1)
      expect(readFileSync(testFile, 'utf8')).toBe(payload1)

      // Overwrite immediately (tests Windows overwrite resilience)
      await safeWriteAtomic(testFile, payload2)
      expect(readFileSync(testFile, 'utf8')).toBe(payload2)
    })
  })

  describe('Port utilities', () => {
    it('correctly discovers a free loopback port', async () => {
      const port = await findFreePort(49152)
      expect(port).toBeGreaterThanOrEqual(49152)
      const inUse = await isPortInUse(port)
      expect(inUse).toBe(false)
    })
  })

  describe('Windows SQLite Engine', () => {
    it('creates database file and executes WAL transactions cleanly on Windows', () => {
      const dbPath = join(tmpdir(), `sheet-test-sqlite-${Date.now()}.db`)
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
        sqlite.close()
      }
    })
  })
})
