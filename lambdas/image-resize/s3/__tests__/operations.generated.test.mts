import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { streamToTempFile } from '../operations.mts'

describe('streamToTempFile', () => {
  it('spools a stream to a private temporary file', async () => {
    const data = Buffer.from('test data')
    const stream = Readable.from([data])

    const result = await streamToTempFile(stream)
    try {
      expect(await readFile(result.path)).toEqual(data)
    } finally {
      await result.cleanup()
    }
  })

  it('should handle multiple chunks', async () => {
    const chunk1 = Buffer.from('hello ')
    const chunk2 = Buffer.from('world')
    const stream = Readable.from([chunk1, chunk2])

    const result = await streamToTempFile(stream)
    try {
      expect((await readFile(result.path)).toString()).toBe('hello world')
    } finally {
      await result.cleanup()
    }
  })
})
