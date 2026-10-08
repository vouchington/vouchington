import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLambdaHandler, type LambdaHandlerDependencies } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'
import { toBase64Url } from '../../test-helpers/image-resize/index.mts'

const AVATAR = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const source: EnvironmentConfig = {
  s3_bucket_origin: { bucket: 'origin', region: 'us-west-2' },
  s3_bucket_cache: { bucket: 'cache', region: 'us-west-2' },
  widths: [100],
  qualities: [75],
  maxHeight: 2400,
}
const sideload: SideloadConfig = {
  s3_bucket_cache: { bucket: 'cache', region: 'us-west-2' },
  widths: [100],
  qualities: [75],
  maxHeight: 2400,
}
const dependency = {
  placementId: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  imageId: '22222222-2222-4222-8222-222222222222',
}

function ogEvent(dependencies: unknown[]): APIGatewayProxyEvent {
  const payload = {
    type: 'landing',
    displayName: 'Ada',
    username: 'ada',
    topCategories: [],
    dependencies,
  }
  const ogBase64url = toBase64Url(JSON.stringify(payload))
  return {
    path: `/og/${ogBase64url}`,
    pathParameters: { ogBase64url },
    queryStringParameters: {},
    headers: {},
  } as unknown as APIGatewayProxyEvent
}

describe('default OG registry authorizer in the handler', () => {
  const fetchAvatar = vi
    .fn<NonNullable<LambdaHandlerDependencies['fetchImageFromS3']>>()
    .mockResolvedValue({ buffer: AVATAR, etag: 'etag', contentType: 'image/png' })
  const handler = createLambdaHandler(
    { source, sideload },
    { createS3Client: () => ({}) as S3Client, fetchImageFromS3: fetchAvatar },
  )

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENVIRONMENT', '')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', 'enforce')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'registry')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    fetchAvatar.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    ['allow', true],
    ['withheld', false],
    [undefined, false],
  ] as const)('renders %s authority with immutable caching', async (state, fetched) => {
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({
      Item: state ? { state: { S: state } } : undefined,
      $metadata: {},
    } as never)
    const response = await handler(ogEvent([dependency]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(fetchAvatar).toHaveBeenCalledTimes(fetched ? 1 : 0)
  })

  it('returns no-store and omits the avatar when the registry fails', async () => {
    vi.spyOn(DynamoDBClient.prototype, 'send').mockRejectedValue(new Error('registry unavailable'))
    const response = await handler(ogEvent([dependency]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('no-store')
    expect(fetchAvatar).not.toHaveBeenCalled()
  })

  it('returns no-store for missing registry configuration but caches an empty card', async () => {
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', '')
    const send = vi.spyOn(DynamoDBClient.prototype, 'send')
    const denied = await handler(ogEvent([dependency]))
    const empty = await handler(ogEvent([]))
    expect(denied.headers?.['Cache-Control']).toBe('no-store')
    expect(empty.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(send).not.toHaveBeenCalled()
    expect(fetchAvatar).not.toHaveBeenCalled()
  })

  it('returns no-store if an injected authorizer throws', async () => {
    const failing = createLambdaHandler(
      { source, sideload },
      {
        createS3Client: () => ({}) as S3Client,
        fetchImageFromS3: fetchAvatar,
        authorizeDependencies: async () => {
          throw new Error('lookup failed')
        },
      },
    )
    const response = await failing(ogEvent([dependency]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('no-store')
    expect(fetchAvatar).not.toHaveBeenCalled()
  })
})
