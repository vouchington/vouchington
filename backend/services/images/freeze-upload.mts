import { createHash } from 'node:crypto'
import { spoolMediaBody, type MediaBody } from '@vouchington/media'

export const MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024

export interface FrozenImageUpload {
  bytes: number
  cleanup(): Promise<void>
  filename: string
  sha256: Buffer
}

export async function freezeImageUpload(
  body: MediaBody,
  options: { maxBytes?: number } = {},
): Promise<FrozenImageUpload> {
  const hash = createHash('sha256')
  let bytes = 0

  async function* hashSource(): AsyncGenerator<Uint8Array> {
    for await (const chunk of body) {
      const frozenChunk = Buffer.from(chunk)
      hash.update(frozenChunk)
      bytes += frozenChunk.byteLength
      yield frozenChunk
    }
  }

  const spooled = await spoolMediaBody(hashSource(), {
    maxBytes: options.maxBytes ?? MAX_IMAGE_UPLOAD_BYTES,
    prefix: 'image-upload-',
  })

  return {
    bytes,
    cleanup: spooled.cleanup,
    filename: spooled.path,
    sha256: hash.digest(),
  }
}
