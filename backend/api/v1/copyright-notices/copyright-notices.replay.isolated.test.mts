// Private child-run case: the parent route test creates and disposes its own database.
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { verifyMediaDeliveryReplayRoute } from '@services/copyright-notices/route-replay-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'

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
    if (getIsolatedDatabaseCaseMode('media-replay') === 'parent') {
      await runIsolatedDatabaseCase('media-replay')
      replayed = true
    } else {
      replayed = await verifyMediaDeliveryReplayRoute()
    }
    expect(replayed).toBe(true)
  }, 240_000)
})
