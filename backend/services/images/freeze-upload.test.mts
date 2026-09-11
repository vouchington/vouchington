import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { MediaSizeLimitError, type MediaBody } from '@vouchington/media'
import { describe, expect, it, vi } from 'vitest'
import { freezeImageUpload } from './freeze-upload.mts'

describe('freezeImageUpload', () => {
  it('spools and hashes every source byte exactly once', async () => {
    const chunks = [Buffer.from('frozen '), Buffer.from('image')]
    const sourceRead = vi.fn<(chunk: Buffer) => void>()
    async function* source(): AsyncGenerator<Buffer> {
      for (const chunk of chunks) {
        sourceRead(chunk)
        yield chunk
      }
    }

    const frozen = await freezeImageUpload(source() as MediaBody)
    try {
      expect(await readFile(frozen.filename)).toEqual(Buffer.concat(chunks))
      expect(frozen.sha256).toEqual(createHash('sha256').update(Buffer.concat(chunks)).digest())
      expect(frozen.bytes).toBe(Buffer.concat(chunks).byteLength)
      expect(sourceRead).toHaveBeenCalledTimes(chunks.length)
    } finally {
      await frozen.cleanup()
    }
  })

  it('rejects a source whose streamed bytes exceed the hard limit', async () => {
    const source = (async function* () {
      yield Buffer.from('123')
      yield Buffer.from('456')
    })()

    await expect(freezeImageUpload(source as MediaBody, { maxBytes: 5 })).rejects.toBeInstanceOf(
      MediaSizeLimitError,
    )
  })
})
