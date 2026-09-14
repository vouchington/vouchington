import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { S3Client } from '@aws-sdk/client-s3'
import { createLambdaHandler, type LambdaHandlerDependencies } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'
import { HttpOperationError, S3OperationError } from '../errors.mts'
import { toBase64Url } from '../../test-helpers/image-resize/index.mts'

describe('handler.sideload', () => {
  const mockEnvConfig: EnvironmentConfig = {
    s3_bucket_origin: {
      bucket: 'test-origin-bucket',
      region: 'us-west-2',
    },
    s3_bucket_cache: {
      bucket: 'test-cache-bucket',
      region: 'us-west-2',
    },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  const mockSideloadConfig: SideloadConfig = {
    s3_bucket_cache: {
      bucket: 'test-cache-bucket',
      region: 'us-west-2',
    },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  function createMockSideloadEvent(
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

  describe('handler sideload tests', () => {
    let handler: ReturnType<typeof createLambdaHandler>
    let dependencies: LambdaHandlerDependencies

    beforeEach(() => {
      dependencies = {
        createS3Client: vi.fn<NonNullable<LambdaHandlerDependencies['createS3Client']>>(
          () => ({}) as S3Client,
        ),
        fetchImageFromS3: vi
          .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromS3']>>()
          .mockRejectedValue(new S3OperationError('not found', 404)),
        putImageToCache: vi
          .fn<NonNullable<LambdaHandlerDependencies['putImageToCache']>>()
          .mockResolvedValue(undefined),
        transformImage: vi
          .fn<NonNullable<LambdaHandlerDependencies['transformImage']>>()
          .mockRejectedValue(
            new Error('unreachable: transform should not be called in sideload error tests'),
          ),
        fetchImageFromUrl: vi
          .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromUrl']>>()
          .mockRejectedValue(new HttpOperationError('Mock sideload fetch failure', 500)),
        captureCacheWriteError: vi.fn<(error: unknown) => void>(),
      }

      handler = createLambdaHandler(
        {
          source: mockEnvConfig,
          sideload: mockSideloadConfig,
        },
        dependencies,
      )
    })

    async function expectSideloadRequestReachesFetchBoundary(
      url: string,
      params: Record<string, string>,
      headers: Record<string, string> = {},
    ) {
      const fetchImageFromUrl = vi.mocked(dependencies.fetchImageFromUrl!)
      fetchImageFromUrl.mockClear()
      const result = await handler(createMockSideloadEvent(url, params, headers))

      expect(result.statusCode).toBe(500)
      expect(fetchImageFromUrl).toHaveBeenCalledWith(url, expect.any(Number), expect.any(Number))
    }

    describe('sideload request validation', () => {
      it('should return 400 for missing width parameter', async () => {
        const event = createMockSideloadEvent('https://example.com/image.jpg', {})

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('w')
      })

      it('should return 400 for invalid width', async () => {
        const event = createMockSideloadEvent('https://example.com/image.jpg', {
          w: 'invalid',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('width')
      })

      it('should return 400 for invalid URL protocol', async () => {
        const event = createMockSideloadEvent('ftp://example.com/image.jpg', {
          w: '800',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('http')
      })

      it('should return 400 for file:// protocol', async () => {
        const event = createMockSideloadEvent('file:///etc/passwd', {
          w: '800',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('http')
      })

      it('should return 400 for missing base64url', async () => {
        const event = {
          path: '/sideload/',
          pathParameters: {},
          queryStringParameters: { w: '800' },
          headers: {},
        } as unknown as APIGatewayProxyEvent

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('base64url')
      })

      it('should return 400 for invalid quality', async () => {
        const event = createMockSideloadEvent('https://example.com/image.jpg', {
          w: '800',
          q: '150',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('quality')
      })

      it('should return 400 for invalid format', async () => {
        const event = createMockSideloadEvent('https://example.com/image.jpg', {
          w: '800',
          f: 'gif',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('format')
      })
    })

    describe('sideload HTTP error handling', () => {
      it('should return error when fetch fails', async () => {
        const event = createMockSideloadEvent('https://invalid-nonexistent-domain-12345.example', {
          w: '800',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(500)
        const body = JSON.parse(result.body)
        expect(body.error).toBe('Mock sideload fetch failure')
      })
    })

    describe('sideload parameter parsing', () => {
      it('should handle Lambda Function URL rawPath events', async () => {
        const url = 'https://example.com/function-url-image.jpg'
        const base64url = toBase64Url(url)
        const event = {
          rawPath: `/sideload/${base64url}`,
          pathParameters: null,
          queryStringParameters: { w: '800' },
          headers: {},
        } as unknown as APIGatewayProxyEvent

        const result = await handler(event)

        expect(result.statusCode).toBe(500)
        expect(dependencies.fetchImageFromUrl).toHaveBeenCalledWith(
          url,
          expect.any(Number),
          expect.any(Number),
        )
      })

      it('should accept http URLs', async () => {
        await expectSideloadRequestReachesFetchBoundary('http://example.com/image.jpg', {
          w: '800',
        })
      })

      it('should accept https URLs', async () => {
        await expectSideloadRequestReachesFetchBoundary('https://example.com/image.jpg', {
          w: '800',
        })
      })

      it('should handle URLs with query parameters', async () => {
        await expectSideloadRequestReachesFetchBoundary(
          'https://cdn.example.com/image.jpg?v=123&quality=high',
          {
            w: '800',
          },
        )
      })

      it('should parse all transformation parameters', async () => {
        await expectSideloadRequestReachesFetchBoundary('https://example.com/image.jpg', {
          w: '800',
          h: '600',
          q: '90',
          l: '1',
          p: '1',
          f: 'webp',
        })
      })
    })
  })
})
