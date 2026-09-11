import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { mergeCsvFiles, writeLineWithBackpressure } from '../export.mts'

type TestWritableStream = EventEmitter & {
  writes: string[]
  write: (buffer: string | Uint8Array) => boolean
}

const createTestWritableStream = (writeResult: boolean): TestWritableStream => {
  const stream = new EventEmitter() as TestWritableStream
  stream.writes = []
  stream.write = (buffer: string | Uint8Array): boolean => {
    stream.writes.push(typeof buffer === 'string' ? buffer : Buffer.from(buffer).toString('utf8'))
    return writeResult
  }
  return stream
}

describe('writeLineWithBackpressure', () => {
  it('writes immediately when stream has buffer capacity', async () => {
    const stream = createTestWritableStream(true)

    await writeLineWithBackpressure(stream as unknown as NodeJS.WritableStream, 'line\n')

    expect(stream.writes).toEqual(['line\n'])
  })

  it('waits for drain when write() returns false', async () => {
    const stream = createTestWritableStream(false)

    let resolved = false
    const writePromise = writeLineWithBackpressure(
      stream as unknown as NodeJS.WritableStream,
      'line\n',
    ).then(() => {
      resolved = true
      return undefined
    })

    await Promise.resolve()
    expect(resolved).toBe(false)

    stream.emit('drain')
    await writePromise

    expect(resolved).toBe(true)
    expect(stream.writes).toEqual(['line\n'])
  })
})

describe('mergeCsvFiles', () => {
  it('writes a headers-only bookmarks csv when all temp files are empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-export-test-'))
    const outPath = join(dir, 'bookmarks.csv')
    const emptyA = join(dir, 'a.csv')
    const emptyB = join(dir, 'b.csv')

    try {
      await writeFile(emptyA, '')
      await writeFile(emptyB, '')

      await mergeCsvFiles(outPath, [emptyA, emptyB], 'object_id,predicate,created_at\n')

      const output = await readFile(outPath, 'utf8')
      expect(output).toBe('object_id,predicate,created_at\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
