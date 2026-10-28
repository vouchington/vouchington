import { describe, it, expect, vi } from 'vitest'
import type { S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { access } from 'node:fs/promises'
import { MAX_INPUT_IMAGE_BYTES } from '../../config.mts'
import { S3OperationError } from '../../errors.mts'
import { fetchImageFromS3 } from '../operations.mts'

describe('fetchImageFromS3 size limits', () => {
  it('throws 413 when the stream exceeds the running byte limit', async () => {
    const oversizedBody = Readable.from([Buffer.alloc(MAX_INPUT_IMAGE_BYTES + 1)])
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockResolvedValue({ Body: oversizedBody }),
    } as unknown as S3Client

    const error = await fetchImageFromS3(mockClient, 'test-bucket', 'oversized-stream').catch(
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(S3OperationError)
    expect((error as S3OperationError).statusCode).toBe(413)
  })

  it('removes a completed temporary artifact when its owner cleans up', async () => {
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockResolvedValue({
        Body: Readable.from([Buffer.from('image')]),
      }),
    } as unknown as S3Client

    const image = await fetchImageFromS3(mockClient, 'test-bucket', 'image-key')
    const path = image.file!.path
    await image.file!.cleanup()
    await expect(access(path)).rejects.toThrow('ENOENT')
  })

  it('throws 413 from ContentLength without concatenating the body', async () => {
    const mockBuffer = Buffer.from('should-not-matter')
    const body = Readable.from([mockBuffer])
    const destroySpy = vi.spyOn(body, 'destroy')
    const mockClient = {
      send: vi.fn<VitestLooseMock>().mockResolvedValue({
        Body: body,
        ContentLength: MAX_INPUT_IMAGE_BYTES + 1,
        ETag: '"abc123"',
        ContentType: 'image/jpeg',
      }),
    } as unknown as S3Client

    const error = await fetchImageFromS3(mockClient, 'test-bucket', 'huge-key').catch(
      (err: unknown) => err,
    )
    expect(error).toBeInstanceOf(S3OperationError)
    expect((error as S3OperationError).statusCode).toBe(413)
    expect(destroySpy).toHaveBeenCalledOnce()
  })
})
