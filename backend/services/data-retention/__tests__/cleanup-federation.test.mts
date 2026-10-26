import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  countFederationReplayDecoysForTest,
  deleteFederationInboxFixturesForTest,
  insertFederationRetentionFixturesForTest,
  insertFederationReplayDecoysForTest,
  insertTestPost,
  prepareFederationDistributionReplayForTest,
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
        distributionActivityIds: [
          ...fixtureIds.expiredDistributionActivityIds,
          fixtureIds.unfinishedDistributionActivityId,
        ],
        followerDistributionIds: [
          fixtureIds.expiredFollowerDistributionIds[1],
          fixtureIds.activeFollowerDistributionId,
          fixtureIds.currentFollowerDistributionId,
        ],
        childRowCount: 2,
      })

      await expect(
        prepareFederationDistributionReplayForTest(
          fixtureIds.expiredDistributionActivityIds[0]!,
          sender.id,
        ),
      ).resolves.toEqual({ status: 'completed' })

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
        distributionActivityIds: [
          ...fixtureIds.expiredDistributionActivityIds,
          fixtureIds.unfinishedDistributionActivityId,
        ],
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

  it('deletes only aged inbox and completed outbound identities in capped pages', async () => {
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
      const decoys = await insertFederationReplayDecoysForTest(query, sender.id, now)
      const inboxScope = {
        activityIds: [...ids.expiredInboxActivityIds, ids.currentInboxActivityId],
      }
      const outboundScope = {
        activityIds: [...ids.expiredDistributionActivityIds, ids.unfinishedDistributionActivityId],
      }

      const firstInbox = await cleanupActivityPubReplayLedgerForTest('inbox', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: inboxScope,
      })
      const firstOutbound = await cleanupActivityPubReplayLedgerForTest('outbound', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: outboundScope,
      })
      expect(firstInbox).toMatchObject({ deleted: 1, hasMore: true })
      expect(firstOutbound).toMatchObject({ deleted: 1, hasMore: true })
      const secondInbox = await cleanupActivityPubReplayLedgerForTest('inbox', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: inboxScope,
      })
      const secondOutbound = await cleanupActivityPubReplayLedgerForTest('outbound', {
        batchSize: 1,
        maxBatches: 1,
        now,
        borrowedQuery: query,
        scope: outboundScope,
      })
      expect(secondInbox).toMatchObject({ deleted: 1, hasMore: false })
      expect(secondOutbound).toMatchObject({ deleted: 1, hasMore: false })
      expect(
        await cleanupActivityPubReplayLedgerForTest('inbox', {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery: query,
          scope: inboxScope,
        }),
      ).toEqual({ deleted: 0, hasMore: false, continuationPosition: null })
      expect(await readFederationRetentionFixtureStateForTest(query, ids)).toMatchObject({
        inboxActivityIds: [ids.currentInboxActivityId],
        distributionActivityIds: [ids.unfinishedDistributionActivityId],
      })
      expect(await countFederationReplayDecoysForTest(query, decoys)).toEqual({
        inbox: 1,
        outbound: 1,
      })
    })
  })
})
