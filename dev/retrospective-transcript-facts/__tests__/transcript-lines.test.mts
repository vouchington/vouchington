import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { openTranscriptLines } from '../transcript-lines.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'transcript-lines-'))
  testDirs.push(dir)
  return dir
}

describe('transcript-lines', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('opens once and yields multi-chunk JSONL lines incrementally', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'streamed.jsonl')
    await writeFile(filePath, `${'x'.repeat(80 * 1024)}\n{"after":"chunk"}\n`, 'utf8')

    const opened = await openTranscriptLines(filePath)
    expect('error' in opened).toBe(false)
    if ('error' in opened) return
    const iterator = opened.lines[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ value: 'x'.repeat(80 * 1024) })
    await expect(iterator.next()).resolves.toMatchObject({ value: '{"after":"chunk"}' })
    await iterator.return?.()
  })

  it('preserves String.split newline semantics', async () => {
    const dir = await makeTempDir()
    const empty = join(dir, 'empty.jsonl')
    const lines = join(dir, 'lines.jsonl')
    await writeFile(empty, '', 'utf8')
    await writeFile(lines, 'one\r\ntwo\n', 'utf8')

    const emptyOpened = await openTranscriptLines(empty)
    const linesOpened = await openTranscriptLines(lines)
    expect('error' in emptyOpened || 'error' in linesOpened).toBe(false)
    if ('error' in emptyOpened || 'error' in linesOpened) return
    const emptyIterator = emptyOpened.lines[Symbol.asyncIterator]()
    const linesIterator = linesOpened.lines[Symbol.asyncIterator]()
    await expect(emptyIterator.next()).resolves.toMatchObject({ value: '' })
    await expect(linesIterator.next()).resolves.toMatchObject({ value: 'one\r' })
    await expect(linesIterator.next()).resolves.toMatchObject({ value: 'two' })
    await expect(linesIterator.next()).resolves.toMatchObject({ value: '' })
  })

  it('returns a read error for a missing path', async () => {
    const dir = await makeTempDir()
    const opened = await openTranscriptLines(join(dir, 'missing.jsonl'))
    expect(opened).toMatchObject({ error: expect.any(String) })
  })

  it('rejects a newline-free record larger than the 2 MiB architectural limit', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'oversized.jsonl')
    await writeFile(filePath, 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8')

    const opened = await openTranscriptLines(filePath)
    expect('error' in opened).toBe(false)
    if ('error' in opened) return
    await expect(opened.lines[Symbol.asyncIterator]().next()).rejects.toThrow(
      'transcript record exceeds 2097152 byte limit',
    )
  })

  it('accepts a record exactly at the 2 MiB boundary', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'boundary.jsonl')
    const record = 'x'.repeat(2 * 1024 * 1024)
    await writeFile(filePath, `${record}\n`, 'utf8')

    const opened = await openTranscriptLines(filePath)
    expect('error' in opened).toBe(false)
    if ('error' in opened) return
    const iterator = opened.lines[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ value: record })
    await expect(iterator.next()).resolves.toMatchObject({ value: '' })
  })
})
