import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'
import { addImageToBatch, MAX_IMAGE_EMBEDDING_SOURCE_BYTES } from './images.mts'

const mocks = vi.hoisted(() => ({
  getImageFromS3: vi.fn<VitestLooseMock>(),
}))

describe('entities/images', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('converts a supported private upload to a bounded Bedrock JPEG representation', async () => {
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: streamBytes(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')),
      ContentType: 'image/gif',
    })
    const fileBuilder = new BatchFileBuilder()

    try {
      await expect(
        addImageToBatch(
          fileBuilder,
          { id: 'gif', s3_key: 'gif', sha_256: Buffer.alloc(32) },
          10,
          mocks,
        ),
      ).resolves.toBe(true)
      const { filePath } = await fileBuilder.close()
      const [record] = (await readFile(filePath, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      const image = record.modelInput.singleEmbeddingParams.image
      expect(image.format).toBe('jpeg')
      expect(Buffer.from(image.source.bytes, 'base64')).toSatisfy(bytes => {
        return (
          bytes.byteLength <= 4 * 1024 * 1024 &&
          bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))
        )
      })
    } finally {
      await fileBuilder.cleanup()
    }
  })

  it('rejects a private source that exceeds the uploaded-image byte limit before transformation', async () => {
    const megabyte = Buffer.alloc(1024 * 1024)
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: streamRepeatedBytes(
        megabyte,
        Math.ceil(MAX_IMAGE_EMBEDDING_SOURCE_BYTES / megabyte.length) + 1,
      ),
      ContentType: 'image/gif',
    })
    const fileBuilder = new BatchFileBuilder()

    await expect(
      addImageToBatch(
        fileBuilder,
        { id: 'oversize', s3_key: 'oversize', sha_256: Buffer.alloc(32) },
        10,
        mocks,
      ),
    ).rejects.toThrow(`${MAX_IMAGE_EMBEDDING_SOURCE_BYTES}-byte limit`)
    await fileBuilder.cleanup()
  })

  it('reads private S3 directly without any public image origin', async () => {
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: streamBytes(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')),
      ContentType: 'image/png',
    })
    const fileBuilder = new BatchFileBuilder()
    const image = { id: 'img-1', s3_key: 'img-1', sha_256: Buffer.from('00'.repeat(32), 'hex') }

    await expect(addImageToBatch(fileBuilder, image, 10, mocks)).resolves.toBe(true)
    expect(mocks.getImageFromS3).toHaveBeenCalledWith(expect.any(String), 'img-1')
    await fileBuilder.cleanup()
  })

  it('reads the canonical object through the private S3 SDK boundary', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: streamBytes(pngBytes),
      ContentType: 'image/png',
    })

    const fileBuilder = new BatchFileBuilder()
    const image = { id: 'img-2', s3_key: 'img-2', sha_256: Buffer.from('00'.repeat(32), 'hex') }

    const added = await addImageToBatch(fileBuilder, image, 100, mocks)

    expect(added).toBe(true)
    expect(mocks.getImageFromS3).toHaveBeenCalledWith(expect.any(String), 'img-2')
    await fileBuilder.cleanup()
  })
})

async function* streamBytes(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  yield* chunks
}

async function* streamRepeatedBytes(chunk: Uint8Array, count: number): AsyncGenerator<Uint8Array> {
  for (let index = 0; index < count; index++) yield chunk
}
