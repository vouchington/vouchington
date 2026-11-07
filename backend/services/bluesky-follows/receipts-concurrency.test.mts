import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestPostgresBackendProcessId,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import {
  getWaitedBlueskyReceiptFollowerForTest,
  lockOwnedBlueskyReceiptsForTest,
} from '@voucha/test-helpers/bluesky-receipt-cleanup-race'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import {
  deleteBlueskyFollowReceipt,
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage,
  getBlueskyFollowReceipt,
  saveBlueskyFollowReceipt,
  START_OF_IDS,
} from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('Bluesky followee receipt cleanup concurrency', () => {
  it('continues after another cleanup deletes the selected receipt while it waits', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const followee = await createTestUserDirect()
    const followers = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    const records = await Promise.all(
      followers.map(async follower => {
        const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
        await saveBlueskyFollowReceipt(
          follower.id,
          followee.id,
          account.bluesky_did,
          account.link_authorization_id,
          `at://${account.bluesky_did}/app.bsky.graph.follow/${randomUUID()}`,
        )
        return { follower, account }
      }),
    )
    const followerIds = followers.map(follower => follower.id)
    await using holder = await beginTransaction()
    await lockOwnedBlueskyReceiptsForTest(holder, followerIds, followee.id)
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        let cleanupProcessId: number | undefined
        const cleanup = (async () => {
          await using query = await beginTransaction()
          cleanupProcessId = await getTestPostgresBackendProcessId(query)
          await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
            followee.id,
            START_OF_IDS,
            {
              query,
            },
          )
          await query.commit()
        })()
        void cleanup.catch(() => {})
        await waitForLock(cleanup)
        if (cleanupProcessId === undefined) throw new Error('Expected the owned cleanup connection')
        const selectedFollowerId = await getWaitedBlueskyReceiptFollowerForTest(
          holder,
          cleanupProcessId,
          followerIds,
          followee.id,
        )
        const selected = records.find(record => record.follower.id === selectedFollowerId)!
        await deleteBlueskyFollowReceipt(
          selectedFollowerId,
          followee.id,
          selected.account.bluesky_did,
          selected.account.link_authorization_id,
          { query: holder },
        )
        await holder.commit()
        await cleanup
      },
    )
    for (const { follower, account } of records) {
      expect(
        await getBlueskyFollowReceipt(
          follower.id,
          followee.id,
          account.bluesky_did,
          account.link_authorization_id,
        ),
      ).toBeNull()
    }
  })
})
