import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { createLambdaHandler } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'

const mockCreateS3Client = vi.fn<VitestLooseMock>(() => ({}))
const mockFetchImageFromS3 = vi.fn<VitestLooseMock>()
const mockPutImageToCache = vi.fn<VitestLooseMock>()
const mockTransformImage = vi.fn<VitestLooseMock>()
const mockFetchImageFromUrl = vi.fn<VitestLooseMock>()
import { S3OperationError } from '../errors.mts'
import { toBase64Url } from '../../test-helpers/image-resize/index.mts'

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

  const CACHE_HIT = {
    buffer: Buffer.from('cached-image'),
    etag: '"cached-etag"',
    contentType: 'image/jpeg',
  }

  const ORIGIN_IMAGE = {
    buffer: Buffer.from('origin-image'),
    etag: '"origin-etag"',
    contentType: 'image/jpeg',
  }

  function createSideloadEvent(
    url: string,
    params: Record<string, string>,
    headers: Record<string, string> = {},
  ): APIGatewayProxyEvent {
    const base64url = toBase64Url(url)
    return {
      path: `/sideload/${base64url}`,
      pathParameters: { base64url },
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
        },
      )
    })

    describe('sideload path: Accept header is incorporated into the cache key', () => {
      beforeEach(() => {
        mockFetchImageFromS3.mockResolvedValue(CACHE_HIT)
      })

      it('uses avif in cache key when Accept prefers avif', async () => {
        const result = await handler(
          createSideloadEvent(
            'https://example.com/photo.jpg',
            { w: '400' },
            { Accept: 'image/avif,image/webp,image/*;q=0.8' },
          ),
        )

        expect(result.statusCode).toBe(200)
        expect(result.headers?.['Content-Type']).toBe('image/avif')

        const cacheKey = mockFetchImageFromS3.mock.calls[0][2]
        expect(cacheKey).toContain('-favif-')
      })

      it('uses webp in cache key when Accept prefers webp', async () => {
        const result = await handler(
          createSideloadEvent(
            'https://example.com/photo.jpg',
            { w: '400' },
            { Accept: 'image/webp' },
          ),
        )

        expect(result.statusCode).toBe(200)
        expect(result.headers?.['Content-Type']).toBe('image/webp')

        const cacheKey = mockFetchImageFromS3.mock.calls[0][2]
        expect(cacheKey).toContain('-fwebp-')
      })

      it('uses jpeg (default) in cache key when no Accept header', async () => {
        const result = await handler(
          createSideloadEvent('https://example.com/photo.jpg', { w: '400' }),
        )

        expect(result.statusCode).toBe(200)
        const cacheKey = mockFetchImageFromS3.mock.calls[0][2]
        expect(cacheKey).toContain('-fjpeg-')
      })

      it('different Accept headers produce different sideload cache keys', async () => {
        await handler(
          createSideloadEvent(
            'https://example.com/photo.jpg',
            { w: '400' },
            { Accept: 'image/avif' },
          ),
        )
        await handler(
          createSideloadEvent(
            'https://example.com/photo.jpg',
            { w: '400' },
            { Accept: 'image/webp' },
          ),
        )

        const avifKey = mockFetchImageFromS3.mock.calls[0][2]
        const webpKey = mockFetchImageFromS3.mock.calls[1][2]

        expect(avifKey).toContain('-favif-')
        expect(webpKey).toContain('-fwebp-')
        expect(avifKey).not.toBe(webpKey)
      })
    })

    describe('sideload path: cache miss writes to the correct format-specific key', () => {
      it('writes transformed image under the negotiated format key', async () => {
        mockFetchImageFromS3.mockRejectedValueOnce(new S3OperationError('not found', 404))
        mockFetchImageFromUrl.mockResolvedValueOnce(ORIGIN_IMAGE)

        const result = await handler(
          createSideloadEvent(
            'https://example.com/photo.jpg',
            { w: '400' },
            { Accept: 'image/webp' },
          ),
        )

        expect(result.statusCode).toBe(200)
        expect(result.headers?.['Content-Type']).toBe('image/webp')

        const cacheReadKey = mockFetchImageFromS3.mock.calls[0][2]
        const cacheWriteKey = mockPutImageToCache.mock.calls[0][2]

        expect(cacheReadKey).toContain('-fwebp-')
        expect(cacheWriteKey).toContain('-fwebp-')
        expect(cacheReadKey).toBe(cacheWriteKey)
      })
    })
  })
})
