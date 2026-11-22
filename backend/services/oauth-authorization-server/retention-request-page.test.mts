import { describe, expect, it } from 'vitest'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { deleteExpiredOAuthAuthorizationServerArtifacts } from './retention.mts'

describe('OAuth authorization request retention', () => {
  it('deletes only one eligible request under a single-row budget', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraRequests: 1,
      only: 'requests',
    })
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).requests).toBe(2)

    const options = {
      lowerBoundDate: window.lowerBoundDate,
      now: window.upperBoundDate,
      maxBatches: 1,
    }
    expect(await deleteExpiredOAuthAuthorizationServerArtifacts(1, options)).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).requests).toBe(1)
  })
})
