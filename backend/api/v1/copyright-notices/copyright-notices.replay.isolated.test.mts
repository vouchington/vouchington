// Private child-run case: the parent route test creates and disposes its own database.
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { verifyMediaDeliveryReplayRoute } from '@services/copyright-notices/route-replay-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIsolatedGlobalMediaReplayCase } from '../../../../test-helpers/vitest-isolated-global-media-replay.mts'

describe('isolated global media replay route', () => {
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('replays failed media registry records only for review staff and writes one audit event', async () => {
    let replayed: boolean
    const isolatedDatabaseName = process.env.VITEST_ISOLATED_GLOBAL_MEDIA_REPLAY_CHILD
    if (!isolatedDatabaseName) {
      await runIsolatedGlobalMediaReplayCase()
      replayed = true
    } else {
      const databaseUrl = process.env.DATABASE_URL
      if (
        !/^voucha_scope_replay_[0-9a-f]{24}$/.test(isolatedDatabaseName) ||
        !databaseUrl ||
        new URL(databaseUrl).pathname !== `/${isolatedDatabaseName}`
      ) {
        throw new Error('Global media replay requires a disposable database')
      }
      replayed = await verifyMediaDeliveryReplayRoute()
    }
    expect(replayed).toBe(true)
  }, 240_000)
})
