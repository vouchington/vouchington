import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  insertFederationInboxReplayForTest,
  ensureFederationReplayFloorForTest,
} from '@voucha/test-helpers/federation-retention-replay'
import { cleanupCommittedReplayPagesForTest } from '@voucha/test-helpers/federation-retention-page-transactions'

describe('replay cleanup page transactions', () => {
  it('holds the floor during each page and releases it before opening the next transaction', async () => {
    // Epoch identities keep any committed floor advance below live accepted activities.
    const ids = [v7({ msecs: 1 }), v7({ msecs: 2 })]
    await withCommittedPostgresTransactionForTest(async query => {
      await ensureFederationReplayFloorForTest(query)
      await insertFederationInboxReplayForTest(query, { id: ids[0]!, receivedAt: new Date(1) })
      await insertFederationInboxReplayForTest(query, { id: ids[1]!, receivedAt: new Date(2) })
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
