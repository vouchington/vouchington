import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { spoolImageToTempFile } from './temp-file.mts'

describe('spoolImageToTempFile', () => {
  it('handles repeated filesystem backpressure and returns a cleanup-owned artifact', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 0x61)
    const chunkCount = 12
    const artifact = await spoolImageToTempFile(
      (async function* () {
        for (let index = 0; index < chunkCount; index += 1) yield chunk
      })(),
      chunk.byteLength * chunkCount,
      bytes => new Error(`too large: ${bytes}`),
    )

    await expect(readFile(artifact.path)).resolves.toHaveLength(chunk.byteLength * chunkCount)
    await artifact.cleanup()
    await expect(access(artifact.path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
