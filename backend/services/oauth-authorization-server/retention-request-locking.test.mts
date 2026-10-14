import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import { lockTestOAuthRetentionFirstRequest } from '@voucha/test-helpers/entities/oauth-retention-requests'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { deleteExpiredOAuthAuthorizationServerArtifacts } from './retention.mts'

describe('OAuth retention request locking', () => {
  it('pages request IDs before skipping a locked first request', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraRequests: 1,
      only: 'requests',
    })
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).requests).toBe(2)

    await using holder = await beginTransaction()
    let released = false
    onTestFinished(async () => {
      if (!released) await holder.rollback()
    })
    await lockTestOAuthRetentionFirstRequest(flow.client.client_id, holder)
    const options = {
      lowerBoundDate: window.lowerBoundDate,
      now: window.upperBoundDate,
      maxBatches: 1,
    }
    expect(await deleteExpiredOAuthAuthorizationServerArtifacts(1, options)).toEqual({
      deleted: 0,
      hasMore: true,
    })
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).requests).toBe(2)
    await holder.rollback()
    released = true
    expect(await deleteExpiredOAuthAuthorizationServerArtifacts(1, options)).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).requests).toBe(1)
  })
})
