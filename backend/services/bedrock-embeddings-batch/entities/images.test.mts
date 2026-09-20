import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'
import { addImageToBatch } from './images.mts'

const mocks = vi.hoisted(() => ({
  getImageFromS3: vi.fn<VitestLooseMock>(),
}))

describe('entities/images', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts a real ReadableStream whose size exactly matches the byte limit', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024)
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
      ContentType: 'image/png',
    })
    const fileBuilder = new BatchFileBuilder()

    await expect(
      addImageToBatch(
        fileBuilder,
        { id: 'exact', s3_key: 'exact', sha_256: Buffer.alloc(32) },
        10,
        mocks,
      ),
    ).resolves.toBe(true)
    await fileBuilder.cleanup()
  })

  it('cancels a real ReadableStream that exceeds the byte limit', async () => {
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array(4 * 1024 * 1024 + 1) },
      ContentType: 'image/png',
    })
    const fileBuilder = new BatchFileBuilder()

    await expect(
      addImageToBatch(
        fileBuilder,
        { id: 'oversize', s3_key: 'oversize', sha_256: Buffer.alloc(32) },
        10,
        mocks,
      ),
    ).rejects.toThrow('Image oversize exceeds Bedrock embedding input limit')
    await fileBuilder.cleanup()
  })

  it('reads private S3 directly without any public image origin', async () => {
    mocks.getImageFromS3.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array() },
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
      Body: { transformToByteArray: async () => pngBytes },
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
