import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeAtomic } from './agent-install'

/** Windows locks the target briefly while an indexer or antivirus reads it. */
const lock = vi.hoisted(() => ({ failures: 0, code: 'EPERM' }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (lock.failures > 0) {
        lock.failures -= 1
        throw Object.assign(new Error(`locked: ${to}`), { code: lock.code })
      }
      return actual.rename(from, to)
    },
  }
})

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sheet-write-atomic-'))
  lock.failures = 0
  lock.code = 'EPERM'
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeAtomic', () => {
  it('replaces a locked file once the lock clears, and leaves no temporary file', async () => {
    const path = join(dir, 'config.json')
    await writeAtomic(path, '{"version":1}')

    lock.failures = 2
    await writeAtomic(path, '{"version":2}')

    expect(await readFile(path, 'utf8')).toBe('{"version":2}')
    expect(await readdir(dir)).toEqual(['config.json'])
    expect(lock.failures).toBe(0)
  })

  it('keeps the existing file when the lock never clears', async () => {
    const path = join(dir, 'config.json')
    await writeAtomic(path, '{"version":1}')

    lock.failures = 50
    await expect(writeAtomic(path, '{"version":2}')).rejects.toThrow('locked')

    expect(await readFile(path, 'utf8')).toBe('{"version":1}')
    expect(await readdir(dir)).toEqual(['config.json'])
  })
})
