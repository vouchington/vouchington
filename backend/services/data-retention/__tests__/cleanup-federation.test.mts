import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  countFederationReplayDecoyForTest,
  deleteFederationInboxFixturesForTest,
  insertFederationRetentionFixturesForTest,
  insertFederationReplayDecoyForTest,
  insertTestPost,
  readFederationRetentionFixtureStateForTest,
  recordFederationInboxActivityReplayForTest,
  type FederationRetentionFixtureIds,
} from '@voucha/test-helpers'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { cleanupFederationRetention } from '../cleanup-federation.mts'
import {
  cleanupFederationRetentionForTest,
  cleanupActivityPubReplayLedgerForTest,
} from '@voucha/test-helpers/federation-retention-scopes'

describe('federation retention', () => {
  it('rejects an unbounded cleanup before opening a transaction', async () => {
    await expect(cleanupFederationRetention({ batchSize: 0, maxBatches: 1 })).rejects.toThrow(
      'batchSize must be a positive safe integer',
    )
  })

  it('preserves replay identities while continuing capped terminal-follower cleanup', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Federation retention fixture',
      slug: `federation-retention-${sender.id}`,
      createdById: sender.id,
      markdown: '',
    })
    let fixtureIds: FederationRetentionFixtureIds | undefined
    onTestFinished(async () => {
      if (fixtureIds) {
        const ownedIds = fixtureIds
        await withCommittedPostgresTransactionForTest(query =>
          deleteFederationInboxFixturesForTest(query, ownedIds),
        )
      }
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })

    const now = new Date()
    fixtureIds = await withCommittedPostgresTransactionForTest(query =>
      insertFederationRetentionFixturesForTest({
        senderUserId: sender.id,
        recipientUserId: recipient.id,
        postId,
        now,
        query,
      }),
    )
    await withPostgresTransactionForTest(async retentionQuery => {
      const scope = {
        followerDistributionIds: [
          ...fixtureIds.expiredFollowerDistributionIds,
          fixtureIds.activeFollowerDistributionId,
          fixtureIds.currentFollowerDistributionId,
        ],
      }

      const first = await cleanupFederationRetentionForTest({
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: retentionQuery,
        scope,
      })
      expect(first.followerDistributions).toEqual({
        deleted: 1,
        hasMore: true,
        continuationPosition: { id: fixtureIds.expiredFollowerDistributionIds[0] },
      })
      expect(
        await readFederationRetentionFixtureStateForTest(retentionQuery, fixtureIds),
      ).toMatchObject({
        inboxActivityIds: fixtureIds.expiredInboxActivityIds.concat(
          fixtureIds.currentInboxActivityId,
        ),
        followerDistributionIds: [
          fixtureIds.expiredFollowerDistributionIds[1],
          fixtureIds.activeFollowerDistributionId,
          fixtureIds.currentFollowerDistributionId,
        ],
        childRowCount: 2,
      })

      const second = await cleanupFederationRetentionForTest({
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: retentionQuery,
        scope,
      })
      expect(second.followerDistributions).toEqual({
        deleted: 1,
        hasMore: false,
        continuationPosition: null,
      })
      expect(await readFederationRetentionFixtureStateForTest(retentionQuery, fixtureIds)).toEqual({
        inboxActivityIds: fixtureIds.expiredInboxActivityIds.concat(
          fixtureIds.currentInboxActivityId,
        ),
        followerDistributionIds: [
          fixtureIds.activeFollowerDistributionId,
          fixtureIds.currentFollowerDistributionId,
        ].toSorted(),
        childRowCount: 0,
      })
      expect(
        await recordFederationInboxActivityReplayForTest(
          retentionQuery,
          `https://retention-test.invalid/activity/0/${fixtureIds.expiredInboxActivityIds[0]}`,
        ),
      ).toBe(false)
    })
  })

  it('deletes only aged inbox identities in capped pages', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Replay retention fixture',
      slug: `replay-retention-${sender.id}`,
      createdById: sender.id,
      markdown: '',
    })
    const now = new Date()
    onTestFinished(async () => {
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })
    await withPostgresTransactionForTest(async query => {
      const ids = await insertFederationRetentionFixturesForTest({
        senderUserId: sender.id,
        recipientUserId: recipient.id,
        postId,
        now,
        query,
      })
      const decoy = await insertFederationReplayDecoyForTest(query, now)
      const inboxScope = {
        activityIds: [...ids.expiredInboxActivityIds, ids.currentInboxActivityId],
      }

      const firstInbox = await cleanupActivityPubReplayLedgerForTest({
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: inboxScope,
      })
      expect(firstInbox).toMatchObject({ deleted: 1, hasMore: true })
      const secondInbox = await cleanupActivityPubReplayLedgerForTest({
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: inboxScope,
      })
      expect(secondInbox).toMatchObject({ deleted: 1, hasMore: false })
      expect(
        await cleanupActivityPubReplayLedgerForTest({
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: inboxScope,
        }),
      ).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
      expect(await readFederationRetentionFixtureStateForTest(query, ids)).toMatchObject({
        inboxActivityIds: [ids.currentInboxActivityId],
      })
      expect(await countFederationReplayDecoyForTest(query, decoy)).toBe(1)
    })
  })
})
