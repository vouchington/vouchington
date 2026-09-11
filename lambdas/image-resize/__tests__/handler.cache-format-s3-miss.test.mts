import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { createLambdaHandler } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'

const mockCreateS3Client = vi.fn<VitestLooseMock>(() => ({}))
const mockFetchImageFromS3 = vi.fn<VitestLooseMock>()
const mockPutImageToCache = vi.fn<VitestLooseMock>()
const mockTransformImage = vi.fn<VitestLooseMock>()
const mockFetchImageFromUrl = vi.fn<VitestLooseMock>()
const mockCaptureCacheWriteError = vi.fn<(error: unknown) => void>()
import { S3OperationError } from '../errors.mts'

describe('handler.cache-format', () => {
  const mockEnvConfig: EnvironmentConfig = {
    s3_bucket_origin: { bucket: 'test-origin-bucket', region: 'us-west-2' },
    s3_bucket_cache: { bucket: 'test-cache-bucket', region: 'us-west-2' },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  const mockSideloadConfig: SideloadConfig = {
    s3_bucket_cache: { bucket: 'test-cache-bucket', region: 'us-west-2' },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  const ORIGIN_IMAGE = {
    buffer: Buffer.from('origin-image'),
    etag: '"origin-etag"',
    contentType: 'image/jpeg',
  }

  function createS3Event(
    params: Record<string, string>,
    headers: Record<string, string> = {},
  ): APIGatewayProxyEvent {
    return {
      queryStringParameters: params,
      headers,
    } as unknown as APIGatewayProxyEvent
  }

  describe('cache key format negotiation', () => {
    let handler: ReturnType<typeof createLambdaHandler>

    beforeEach(() => {
      mockFetchImageFromS3.mockReset()
      mockPutImageToCache.mockReset().mockResolvedValue(undefined as never)
      mockFetchImageFromUrl.mockReset()
      mockCreateS3Client.mockClear()
      mockTransformImage.mockReset()
      mockTransformImage.mockResolvedValue(Buffer.from('transformed-image'))
      mockCaptureCacheWriteError.mockReset()

      handler = createLambdaHandler(
        {
          source: mockEnvConfig,
          sideload: mockSideloadConfig,
        },
        {
          createS3Client: mockCreateS3Client,
          fetchImageFromS3: mockFetchImageFromS3,
          putImageToCache: mockPutImageToCache,
          transformImage: mockTransformImage,
          fetchImageFromUrl: mockFetchImageFromUrl,
          captureCacheWriteError: mockCaptureCacheWriteError,
        },
      )
    })

    describe('S3 path: cache miss writes to the correct format-specific key', () => {
      it('writes transformed image under the negotiated format key', async () => {
        // First call = cache miss, second call = origin fetch
        mockFetchImageFromS3
          .mockRejectedValueOnce(new S3OperationError('not found', 404))
          .mockResolvedValueOnce(ORIGIN_IMAGE)

        const result = await handler(
          createS3Event({ key: 'photo.jpg', w: '400' }, { Accept: 'image/webp,image/*;q=0.8' }),
        )

        expect(result.statusCode).toBe(200)
        expect(result.headers?.['Content-Type']).toBe('image/webp')

        // Both the cache lookup and the cache write should use the same webp key
        const cacheReadKey = mockFetchImageFromS3.mock.calls[0][2]
        const cacheWriteKey = mockPutImageToCache.mock.calls[0][2]

        expect(cacheReadKey).toContain('-fwebp-')
        expect(cacheWriteKey).toContain('-fwebp-')
        expect(cacheReadKey).toBe(cacheWriteKey)
      })

      it('content type passed to putImageToCache matches negotiated format', async () => {
        mockFetchImageFromS3
          .mockRejectedValueOnce(new S3OperationError('not found', 404))
          .mockResolvedValueOnce(ORIGIN_IMAGE)

        await handler(
          createS3Event({ key: 'photo.jpg', w: '400' }, { Accept: 'image/avif,image/webp;q=0.9' }),
        )

        const [, , , , contentType] = mockPutImageToCache.mock.calls[0]
        expect(contentType).toBe('image/avif')
      })

      it('returns 200 when cache PutObject fails after a successful render', async () => {
        mockFetchImageFromS3
          .mockRejectedValueOnce(new S3OperationError('not found', 404))
          .mockResolvedValueOnce(ORIGIN_IMAGE)
        mockPutImageToCache.mockRejectedValueOnce(new S3OperationError('Write failed', 500))

        const result = await handler(
          createS3Event({ key: 'photo.jpg', w: '400' }, { Accept: 'image/webp' }),
        )

        expect(result.statusCode).toBe(200)
        expect(result.headers?.['Content-Type']).toBe('image/webp')
        expect(mockPutImageToCache).toHaveBeenCalledOnce()
        expect(mockCaptureCacheWriteError).toHaveBeenCalledOnce()
      })
    })
  })
})
