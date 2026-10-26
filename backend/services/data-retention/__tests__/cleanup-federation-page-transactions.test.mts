import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  insertCompletedFederationReplayForTest,
  ensureFederationReplayFloorForTest,
} from '@voucha/test-helpers/federation-retention-replay'
import { cleanupCommittedReplayPagesForTest } from '@voucha/test-helpers/federation-retention-page-transactions'

describe('replay cleanup page transactions', () => {
  it('holds the floor during each page and releases it before opening the next transaction', async () => {
    const sender = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(sender.id))
    // Epoch identities keep any committed floor advance below live accepted activities.
    const ids = [v7({ msecs: 1 }), v7({ msecs: 2 })]
    await withCommittedPostgresTransactionForTest(async query => {
      await ensureFederationReplayFloorForTest(query, 'outbound')
      await insertCompletedFederationReplayForTest(query, {
        activityId: ids[0]!,
        sourceUserId: sender.id,
        completedAt: new Date(1),
      })
      await insertCompletedFederationReplayForTest(query, {
        activityId: ids[1]!,
        sourceUserId: sender.id,
        completedAt: new Date(2),
      })
    })
    expect(await cleanupCommittedReplayPagesForTest(ids)).toEqual({
      result: { deleted: 2, hasMore: false, continuationPosition: null },
      pageCount: 2,
      previousPageTransactionActive: [false, false],
      pageTransactionActive: [true, true],
      lockDuringPage: [true, true],
    })
  })
})
