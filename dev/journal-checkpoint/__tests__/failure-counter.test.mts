import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { counterPath, recordFailure } from '../failure-counter.mts'

const testDirs: string[] = []

async function makeBaseDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'journal-checkpoint-failures-'))
  testDirs.push(dir)
  return dir
}

describe('counterPath', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('returns null for a blank session id', () => {
    expect(counterPath('', '/repo', '/tmp')).toBeNull()
  })

  it('is stable across calls with the same session id and worktree root', () => {
    expect(counterPath('sess-1', '/repo', '/tmp')).toBe(counterPath('sess-1', '/repo', '/tmp'))
  })

  it('differs across session ids and across worktree roots', () => {
    const base = counterPath('sess-1', '/repo', '/tmp')
    expect(counterPath('sess-2', '/repo', '/tmp')).not.toBe(base)
    expect(counterPath('sess-1', '/other-repo', '/tmp')).not.toBe(base)
  })
})

describe('recordFailure', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('returns null and writes nothing for a blank session id', async () => {
    const baseDir = await makeBaseDir()
    const result = recordFailure('', '/repo', { command: 'x', stderrHead: 'y' }, baseDir)
    expect(result).toBeNull()
    expect(await readdir(baseDir)).toHaveLength(0)
  })

  it('increments across calls and caps tracked failures at 3', async () => {
    const baseDir = await makeBaseDir()
    recordFailure('sess-1', '/repo', { command: 'a', stderrHead: 'a-err' }, baseDir)
    recordFailure('sess-1', '/repo', { command: 'b', stderrHead: 'b-err' }, baseDir)
    const third = recordFailure('sess-1', '/repo', { command: 'c', stderrHead: 'c-err' }, baseDir)
    const fourth = recordFailure('sess-1', '/repo', { command: 'd', stderrHead: 'd-err' }, baseDir)

    expect(third).toEqual({
      count: 3,
      failures: [
        { command: 'a', stderrHead: 'a-err' },
        { command: 'b', stderrHead: 'b-err' },
        { command: 'c', stderrHead: 'c-err' },
      ],
    })
    expect(fourth).toEqual({
      count: 4,
      failures: [
        { command: 'b', stderrHead: 'b-err' },
        { command: 'c', stderrHead: 'c-err' },
        { command: 'd', stderrHead: 'd-err' },
      ],
    })
  })

  it('keeps separate counts per session id under the same worktree root', async () => {
    const baseDir = await makeBaseDir()
    recordFailure('sess-1', '/repo', { command: 'a', stderrHead: '' }, baseDir)
    const result = recordFailure('sess-2', '/repo', { command: 'b', stderrHead: '' }, baseDir)
    expect(result?.count).toBe(1)
  })

  it('resets the count once the counter file is older than the 12h TTL', async () => {
    const baseDir = await makeBaseDir()
    recordFailure('sess-1', '/repo', { command: 'a', stderrHead: '' }, baseDir)
    const file = counterPath('sess-1', '/repo', baseDir)
    if (file === null) throw new Error('expected a counter path for a non-blank session id')
    const staleTime = new Date(Date.now() - 13 * 60 * 60 * 1000)
    await utimes(file, staleTime, staleTime)

    const result = recordFailure('sess-1', '/repo', { command: 'b', stderrHead: '' }, baseDir)
    expect(result).toEqual({ count: 1, failures: [{ command: 'b', stderrHead: '' }] })
  })
})
