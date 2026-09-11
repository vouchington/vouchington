import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchFileBuilder } from '../orchestrator/file-builder.mts'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('undici')>(import('undici'), () => ({
  fetch: mocks.fetch,
}))

import { addImageToBatch } from './images.mts'

describe('entities/images', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts a real ReadableStream whose size exactly matches the byte limit', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')
    const bytes = new Uint8Array(4 * 1024 * 1024)
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
        {
          headers: { 'content-type': 'image/png' },
        },
      ),
    )
    const fileBuilder = new BatchFileBuilder()

    await expect(
      addImageToBatch(fileBuilder, { id: 'exact', s3_key: 'exact', sha_256: Buffer.alloc(32) }, 10),
    ).resolves.toBe(true)
    await fileBuilder.cleanup()
  })

  it('cancels a real ReadableStream that exceeds the byte limit', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')
    const cancel = vi.fn<() => void>()
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4 * 1024 * 1024))
            controller.enqueue(new Uint8Array(1))
          },
          cancel,
        }),
        { headers: { 'content-type': 'image/png' } },
      ),
    )
    const fileBuilder = new BatchFileBuilder()

    await expect(
      addImageToBatch(
        fileBuilder,
        { id: 'oversize', s3_key: 'oversize', sha_256: Buffer.alloc(32) },
        10,
      ),
    ).rejects.toThrow('Image oversize exceeds Bedrock embedding input limit')
    expect(cancel).toHaveBeenCalledOnce()
    await fileBuilder.cleanup()
  })

  it('throws for non-public image origins and never calls fetch', async () => {
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3903')
    vi.stubEnv('IMAGE_ORIGIN', '')

    const fileBuilder = new BatchFileBuilder()
    const image = { id: 'img-1', s3_key: 'img-1', sha_256: Buffer.from('00'.repeat(32), 'hex') }

    await expect(addImageToBatch(fileBuilder, image, 10)).rejects.toThrow(
      'Refusing to fetch non-public image URL for image img-1',
    )
    expect(mocks.fetch).not.toHaveBeenCalled() // guard fires before fetch
    await fileBuilder.cleanup()
  })

  it('fetches the image URL when the origin is a public FQDN', async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    mocks.fetch.mockResolvedValueOnce(
      new Response(pngBytes, { headers: { 'content-type': 'image/png' } }),
    )

    const fileBuilder = new BatchFileBuilder()
    const image = { id: 'img-2', s3_key: 'img-2', sha_256: Buffer.from('00'.repeat(32), 'hex') }

    const added = await addImageToBatch(fileBuilder, image, 100)

    expect(added).toBe(true)
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://images.example.com/images/img-2?w=400',
      expect.objectContaining({ headers: { accept: 'image/png,image/jpeg,image/webp' } }),
    )
    await fileBuilder.cleanup()
  })
})
