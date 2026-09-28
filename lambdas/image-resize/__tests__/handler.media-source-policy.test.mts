import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { S3Client } from '@aws-sdk/client-s3'
import { TRANSFORMED_SIDELOAD_CACHE_PREFIX } from '@ts-shared/url-signing'
import { sha256 } from '../cache/index.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'
import { S3OperationError } from '../errors.mts'
import { createLambdaHandler, type LambdaHandlerDependencies } from '../handler.mts'
import { toBase64Url } from '../../test-helpers/image-resize/index.mts'

const SOURCE = 'https://cdn.example/photo.jpg'
const PLACEMENT = {
  placementId: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  imageId: '22222222-2222-4222-8222-222222222222',
}

describe('media source policy before cache delivery', () => {
  const environments = {
    source: {
      s3_bucket_origin: { bucket: 'origin', region: 'us-west-2' },
      s3_bucket_cache: { bucket: 'cache', region: 'us-west-2' },
      widths: [400],
      qualities: [75],
      maxHeight: 2400,
    } satisfies EnvironmentConfig,
    sideload: {
      s3_bucket_cache: { bucket: 'cache', region: 'us-west-2' },
      widths: [400],
      qualities: [75],
      maxHeight: 2400,
    } satisfies SideloadConfig,
  }

  let dependencies: LambdaHandlerDependencies
  let handler: ReturnType<typeof createLambdaHandler>

  function sideloadEvent(url: string, pathPrefix = '/sideload/v2/'): APIGatewayProxyEvent {
    const base64url = toBase64Url(url)
    return {
      path: `${pathPrefix}${base64url}`,
      pathParameters: pathPrefix === '/sideload/v2/' ? { base64url } : {},
      queryStringParameters: { w: '400' },
      headers: {},
    } as unknown as APIGatewayProxyEvent
  }

  beforeEach(() => {
    dependencies = {
      createS3Client: vi.fn<NonNullable<LambdaHandlerDependencies['createS3Client']>>(
        () => ({}) as S3Client,
      ),
      fetchImageFromS3: vi
        .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromS3']>>()
        .mockResolvedValue({ buffer: Buffer.from('cached'), etag: 'e', contentType: 'image/jpeg' }),
      putImageToCache: vi
        .fn<NonNullable<LambdaHandlerDependencies['putImageToCache']>>()
        .mockResolvedValue(undefined),
      transformImage: vi
        .fn<NonNullable<LambdaHandlerDependencies['transformImage']>>()
        .mockResolvedValue(Buffer.from('transformed')),
      fetchImageFromUrl: vi
        .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromUrl']>>()
        .mockResolvedValue({
          buffer: Buffer.from('origin'),
          etag: 'o',
          contentType: 'image/jpeg',
        }),
      captureCacheWriteError: vi.fn<(error: unknown) => void>(),
      authorizeDependencies: async () => ['allow'],
    }
    handler = createLambdaHandler(environments, dependencies)
  })

  it('serves a warm transformed object without fetching the source again', async () => {
    const result = await handler(sideloadEvent(SOURCE))
    expect(result.statusCode).toBe(200)
    const cacheKey = vi.mocked(dependencies.fetchImageFromS3).mock.calls[0]?.[2]
    expect(cacheKey?.startsWith(`${TRANSFORMED_SIDELOAD_CACHE_PREFIX}${sha256(SOURCE)}`)).toBe(true)
    expect(dependencies.fetchImageFromUrl).not.toHaveBeenCalled()
  })

  it('fetches the source on a cold miss and stores the isolated transformed key', async () => {
    vi.mocked(dependencies.fetchImageFromS3).mockRejectedValueOnce(
      new S3OperationError('miss', 404),
    )
    const result = await handler(sideloadEvent(SOURCE))
    expect(result.statusCode).toBe(200)
    expect(dependencies.fetchImageFromUrl).toHaveBeenCalledWith(
      SOURCE,
      expect.any(Number),
      expect.any(Number),
    )
    const cacheKey = vi.mocked(dependencies.fetchImageFromS3).mock.calls[0]?.[2]
    expect(cacheKey.startsWith(TRANSFORMED_SIDELOAD_CACHE_PREFIX)).toBe(true)
    expect(cacheKey.startsWith(sha256(SOURCE))).toBe(false)
  })

  it('does not read a legacy transformed key or a removed route', async () => {
    const removed = await handler(sideloadEvent(SOURCE, '/sideload/'))
    expect(removed.statusCode).toBe(404)
    expect(dependencies.fetchImageFromS3).not.toHaveBeenCalled()
  })

  it('rejects a first-party origin before cache lookup', async () => {
    const result = await handler(sideloadEvent('https://images.voucha.ai/photo.jpg'))
    expect(result.statusCode).toBe(403)
    expect(dependencies.fetchImageFromS3).not.toHaveBeenCalled()
    expect(dependencies.fetchImageFromUrl).not.toHaveBeenCalled()
  })

  it('does not read avatar bytes for an unknown or withheld dependency', async () => {
    const denied = createLambdaHandler(environments, {
      ...dependencies,
      authorizeDependencies: async () => ['unknown'],
    })
    const event = {
      path: `/og/${toBase64Url(
        JSON.stringify({
          type: 'landing',
          displayName: 'Ada',
          username: 'ada',
          topCategories: [],
          dependencies: [PLACEMENT],
        }),
      )}`,
      queryStringParameters: {},
      headers: {},
    } as unknown as APIGatewayProxyEvent
    event.pathParameters = { ogBase64url: event.path.slice('/og/'.length) }
    const result = await denied(event)
    expect(result.statusCode).toBe(200)
    expect(dependencies.fetchImageFromS3).not.toHaveBeenCalled()
  })

  it('reads avatar bytes only after every dependency is allowed', async () => {
    const event = {
      path: `/og/${toBase64Url(
        JSON.stringify({
          type: 'landing',
          displayName: 'Ada',
          username: 'ada',
          topCategories: [],
          dependencies: [PLACEMENT],
        }),
      )}`,
      queryStringParameters: {},
      headers: {},
    } as unknown as APIGatewayProxyEvent
    event.pathParameters = { ogBase64url: event.path.slice('/og/'.length) }
    const result = await handler(event)
    expect(result.statusCode).toBe(200)
    expect(dependencies.fetchImageFromS3).toHaveBeenCalledWith(
      expect.anything(),
      'origin',
      PLACEMENT.imageId,
    )
  })
})
