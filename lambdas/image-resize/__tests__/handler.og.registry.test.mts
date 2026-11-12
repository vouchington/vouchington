import { randomUUID } from 'node:crypto'
import type { S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  createOwnedDynamoDbTable,
  putDynamoDbItem,
} from '../../../backend/test-helpers/aws-emulator-owned-dynamodb-table.mts'
import { createLambdaHandler } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'
import { toBase64Url } from '../../test-helpers/image-resize/index.mts'

type LambdaHandlerDependencies = Required<NonNullable<Parameters<typeof createLambdaHandler>[1]>>

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
// Each case is its own placement, so seeded states never collide inside the file's table.
function newDependency() {
  return { placementId: randomUUID(), revision: 1, imageId: randomUUID() }
}

let registryTable: string

async function seedState(dependency: ReturnType<typeof newDependency>, state: string) {
  await putDynamoDbItem(registryTable, {
    delivery_key: { S: getImagePlacementDeliveryKey(dependency) },
    state: { S: state },
  })
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

  // no-mistakes-timeout-reason: the emulator takes about three seconds to make a table ACTIVE
  beforeAll(async () => {
    registryTable = await createOwnedDynamoDbTable('og-handler-registry', 'delivery_key')
  }, 30_000)

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENVIRONMENT', '')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', 'enforce')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', registryTable)
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-west-2')
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
    const dependency = newDependency()
    if (state) await seedState(dependency, state)
    const response = await handler(ogEvent([dependency]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(fetchAvatar).toHaveBeenCalledTimes(fetched ? 1 : 0)
  })

  it('returns no-store and omits the avatar when the registry fails', async () => {
    // A table that was never created: every read against it fails in the emulator.
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', `missing-${randomUUID()}`)
    const response = await handler(ogEvent([newDependency()]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('no-store')
    expect(fetchAvatar).not.toHaveBeenCalled()
  })

  it('returns no-store for missing registry configuration but caches an empty card', async () => {
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', '')
    const denied = await handler(ogEvent([newDependency()]))
    const empty = await handler(ogEvent([]))
    expect(denied.headers?.['Cache-Control']).toBe('no-store')
    expect(empty.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
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
    const response = await failing(ogEvent([newDependency()]))
    expect(response.statusCode).toBe(200)
    expect(response.headers?.['Cache-Control']).toBe('no-store')
    expect(fetchAvatar).not.toHaveBeenCalled()
  })
})
