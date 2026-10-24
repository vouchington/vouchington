import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertFederationRetentionFixturesForTest,
  insertTestPost,
  readFollowerDistributionRetentionCursorForTest,
  resetActivityPubReplayRetentionCursorForTest,
  resetFollowerDistributionRetentionCursorForTest,
} from '@voucha/test-helpers'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { cleanupActivityPubReplayLedger } from '../cleanup-activitypub-replay.mts'
import {
  findRetentionUpperBound,
  listRetentionCandidates,
} from '../cleanup-federation-candidates.mts'
import { cleanupSweepWithQuery } from '../cleanup-federation-run.mts'

describe('federation retention continuation', () => {
  it('finds no unscoped terminal follower candidates before the UUIDv7 epoch', async () => {
    await withPostgresTransactionForTest(async query => {
      const beforeEpoch = new Date(0)
      expect(await findRetentionUpperBound(query, beforeEpoch)).toBeNull()
      expect(
        await listRetentionCandidates(
          query,
          beforeEpoch,
          null,
          'ffffffff-ffff-7fff-ffff-ffffffffffff',
          1,
        ),
      ).toEqual([])
    })
  })

  it('finishes an owned follower page when its next candidate disappears', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Follower retention continuation fixture',
      slug: `follower-retention-continuation-${sender.id}`,
      createdById: sender.id,
      markdown: '',
    })
    onTestFinished(async () => {
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })

    await withPostgresTransactionForTest(async query => {
      const now = new Date()
      const ids = await insertFederationRetentionFixturesForTest({
        senderUserId: sender.id,
        recipientUserId: recipient.id,
        postId,
        now,
        query,
      })
      await resetFollowerDistributionRetentionCursorForTest(query, now)
      const scope = { followerDistributionIds: ids.expiredFollowerDistributionIds }

      const first = await cleanupSweepWithQuery({ batchSize: 1, maxBatches: 1, now, scope }, query)
      expect(first).toEqual({
        deleted: 1,
        hasMore: true,
        continuationPosition: { id: ids.expiredFollowerDistributionIds[0] },
      })
      await query(
        `/* removeNextFollowerRetentionCandidateForTest */
         DELETE FROM follower_distributions WHERE id = $1::uuid`,
        [ids.expiredFollowerDistributionIds[1]],
      )
      const second = await cleanupSweepWithQuery({ batchSize: 1, maxBatches: 1, now, scope }, query)
      expect(second).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
      expect(await readFollowerDistributionRetentionCursorForTest(query)).toMatchObject({
        sweep_cutoff_at: null,
        cursor_distribution_position: null,
        sweep_upper_bound_distribution_position: null,
      })
    })
  })

  it('finishes an owned inbox replay page when its next identity disappears', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Inbox replay continuation fixture',
      slug: `inbox-replay-continuation-${sender.id}`,
      createdById: sender.id,
      markdown: '',
    })
    onTestFinished(async () => {
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })

    await withPostgresTransactionForTest(async query => {
      const now = new Date()
      const ids = await insertFederationRetentionFixturesForTest({
        senderUserId: sender.id,
        recipientUserId: recipient.id,
        postId,
        now,
        query,
      })
      await resetActivityPubReplayRetentionCursorForTest(query, 'inbox')
      const scope = { activityIds: ids.expiredInboxActivityIds }

      const first = await cleanupActivityPubReplayLedger('inbox', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope,
      })
      expect(first).toMatchObject({ deleted: 1, hasMore: true })
      await query(
        `/* removeNextInboxReplayCandidateForTest */
         DELETE FROM activitypub_inbox_activities WHERE id = $1::uuid`,
        [ids.expiredInboxActivityIds[1]],
      )
      const second = await cleanupActivityPubReplayLedger('inbox', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope,
      })
      expect(second).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
    })
  })
})
