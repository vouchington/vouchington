import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { createLambdaHandler, type LambdaHandlerDependencies } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'
import { S3OperationError } from '../errors.mts'
import { toBase64Url } from '../test-helpers/index.mts'
import { SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

// 1x1 transparent PNG — stands in for an avatar original fetched from S3.
const TEST_AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function createMockOgEvent(
  payload: unknown,
  extraParams: Record<string, string> = {},
): APIGatewayProxyEvent {
  const ogBase64url = toBase64Url(JSON.stringify(payload))
  return {
    path: `/og/${ogBase64url}`,
    pathParameters: { ogBase64url },
    queryStringParameters: extraParams,
    headers: {},
  } as unknown as APIGatewayProxyEvent
}

describe('handler.og', () => {
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

  const savedSigningKeys = process.env[SIDELOAD_SIGNING_KEYS_ENV]
  const savedEnvironment = process.env.ENVIRONMENT
  const savedNodeEnv = process.env.NODE_ENV

  let handler: ReturnType<typeof createLambdaHandler>
  let dependencies: LambdaHandlerDependencies

  beforeEach(() => {
    delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    process.env.NODE_ENV = 'test'
    delete process.env.ENVIRONMENT

    dependencies = {
      createS3Client: vi.fn<NonNullable<LambdaHandlerDependencies['createS3Client']>>(
        () => ({}) as S3Client,
      ),
      fetchImageFromS3: vi
        .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromS3']>>()
        .mockResolvedValue({ buffer: TEST_AVATAR_PNG, etag: 'etag', contentType: 'image/png' }),
      putImageToCache: vi
        .fn<NonNullable<LambdaHandlerDependencies['putImageToCache']>>()
        .mockResolvedValue(undefined),
      transformImage: vi
        .fn<NonNullable<LambdaHandlerDependencies['transformImage']>>()
        .mockRejectedValue(new Error('unreachable: transform should not run for OG requests')),
      fetchImageFromUrl: vi
        .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromUrl']>>()
        .mockRejectedValue(
          new Error('unreachable: fetchImageFromUrl should not run for OG requests'),
        ),
      captureCacheWriteError: vi.fn<(error: unknown) => void>(),
    }

    handler = createLambdaHandler(
      { source: mockEnvConfig, sideload: mockSideloadConfig },
      dependencies,
    )
  })

  afterEach(() => {
    if (savedSigningKeys === undefined) delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    else process.env[SIDELOAD_SIGNING_KEYS_ENV] = savedSigningKeys
    if (savedEnvironment === undefined) delete process.env.ENVIRONMENT
    else process.env.ENVIRONMENT = savedEnvironment
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedNodeEnv
  })

  it('renders a generic card as a 1200x630 PNG without touching S3 or the transform pipeline', async () => {
    const event = createMockOgEvent({
      type: 'generic',
      eyebrow: 'Voucha',
      title: 'A great deal',
      description: 'Save big today',
      domainLabel: 'voucha.ai',
      // Web's OG_RENDERER_VERSION cache-buster rides along in the real
      // payload; the handler must render fine with it present (and ignored).
      rendererVersion: 'v1',
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(200)
    expect(result.headers?.['Content-Type']).toBe('image/png')
    expect(result.isBase64Encoded).toBe(true)
    const png = Buffer.from(result.body, 'base64')
    const metadata = await sharp(png).metadata()
    expect(metadata.width).toBe(1200)
    expect(metadata.height).toBe(630)
    expect(dependencies.fetchImageFromS3).not.toHaveBeenCalled()
    expect(dependencies.transformImage).not.toHaveBeenCalled()
    expect(dependencies.fetchImageFromUrl).not.toHaveBeenCalled()
  })

  it('renders a landing card with an avatar fetched from the origin bucket', async () => {
    const event = createMockOgEvent({
      type: 'landing',
      displayName: 'Ada Lovelace',
      username: 'ada',
      topCategories: ['math', 'computing'],
      avatarImageId: 'avatars/ada.png',
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(200)
    expect(dependencies.fetchImageFromS3).toHaveBeenCalledWith(
      expect.anything(),
      mockEnvConfig.s3_bucket_origin.bucket,
      'avatars/ada.png',
    )
  })

  it('falls back to an initial-letter avatar when no avatarImageId is present', async () => {
    const event = createMockOgEvent({
      type: 'landing',
      displayName: 'Ada Lovelace',
      username: 'ada',
      topCategories: [],
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(200)
    expect(dependencies.fetchImageFromS3).not.toHaveBeenCalled()
  })

  it('falls back to an initial-letter avatar when the S3 fetch misses', async () => {
    vi.mocked(dependencies.fetchImageFromS3!).mockRejectedValue(
      new S3OperationError('not found', 404),
    )
    const event = createMockOgEvent({
      type: 'landing',
      displayName: 'Ada Lovelace',
      username: 'ada',
      topCategories: ['math'],
      avatarImageId: 'avatars/missing.png',
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(200)
  })

  it('renders a landing card with 5 top categories', async () => {
    const event = createMockOgEvent({
      type: 'landing',
      displayName: 'Ada',
      username: 'ada',
      topCategories: ['a', 'b', 'c', 'd', 'e'],
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(200)
  })

  it('returns 400 for malformed OG params', async () => {
    const event = createMockOgEvent({ type: 'generic', eyebrow: 'only-one-field' })

    const result = await handler(event)

    expect(result.statusCode).toBe(400)
  })

  it('rejects unsigned OG requests in staging with 403', async () => {
    process.env.ENVIRONMENT = 'staging'
    const event = createMockOgEvent({
      type: 'generic',
      eyebrow: 'Voucha',
      title: 'A great deal',
      description: 'Save big today',
      domainLabel: 'voucha.ai',
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(403)
  })
})
