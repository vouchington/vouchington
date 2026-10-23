import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  deleteFederationInboxFixturesForTest,
  insertFederationRetentionFixturesForTest,
  insertTestPost,
  prepareFederationDistributionReplayForTest,
  readFederationRetentionFixtureStateForTest,
  readFollowerDistributionRetentionCursorForTest,
  recordFederationInboxActivityReplayForTest,
  resetFollowerDistributionRetentionCursorForTest,
  type FederationRetentionFixtureIds,
} from '@voucha/test-helpers'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { beginTransaction } from '@data-stores/psql'
import { cleanupFederationRetention } from '../cleanup-federation.mts'
import { cleanupActivityPubReplayLedger } from '../cleanup-activitypub-replay.mts'

describe('federation retention', () => {
  it('preserves replay identities while continuing capped terminal-follower cleanup', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Federation retention fixture',
      slug: `federation-retention-${sender.id}`,
      createdById: sender.id,
      markdown: '',
    })
    let fixtureQuery: Awaited<ReturnType<typeof beginTransaction>> | undefined
    let retentionQuery: Awaited<ReturnType<typeof beginTransaction>> | undefined
    let fixtureIds: FederationRetentionFixtureIds | undefined
    onTestFinished(async () => {
      await retentionQuery?.rollback()
      await fixtureQuery?.rollback()
      if (fixtureIds) {
        await using cleanup = await beginTransaction()
        await deleteFederationInboxFixturesForTest(cleanup, fixtureIds)
        await cleanup.commit()
      }
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })

    const now = new Date()
    const setupQuery = await beginTransaction()
    fixtureQuery = setupQuery
    fixtureIds = await insertFederationRetentionFixturesForTest({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      postId,
      now,
      query: setupQuery,
    })
    await setupQuery.commit()
    fixtureQuery = undefined
    retentionQuery = await beginTransaction()
    expect(await resetFollowerDistributionRetentionCursorForTest(retentionQuery, now)).toBe(
      'ffffffff-ffff-7fff-ffff-ffffffffffff',
    )
    const scope = {
      followerDistributionIds: [
        ...fixtureIds.expiredFollowerDistributionIds,
        fixtureIds.activeFollowerDistributionId,
        fixtureIds.currentFollowerDistributionId,
      ],
    }

    const first = await cleanupFederationRetention({
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
    expect(await readFollowerDistributionRetentionCursorForTest(retentionQuery)).toMatchObject({
      cursor_distribution_id: fixtureIds.expiredFollowerDistributionIds[0],
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

    const second = await cleanupFederationRetention({
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
    expect(await readFollowerDistributionRetentionCursorForTest(retentionQuery)).toMatchObject({
      sweep_cutoff_at: null,
      cursor_distribution_id: null,
      sweep_upper_bound_distribution_id: null,
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
    let ids: FederationRetentionFixtureIds | undefined
    onTestFinished(async () => {
      if (ids) {
        await using cleanup = await beginTransaction()
        await deleteFederationInboxFixturesForTest(cleanup, ids)
        await cleanup.commit()
      }
      await deleteTestPost(postId)
      await deleteTestUser(recipient.id)
      await deleteTestUser(sender.id)
    })
    await using setup = await beginTransaction()
    ids = await insertFederationRetentionFixturesForTest({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      postId,
      now,
      query: setup,
    })
    await setup.commit()

    const firstInbox = await cleanupActivityPubReplayLedger('inbox', {
      batchSize: 1,
      maxBatches: 1,
      now,
    })
    const firstOutbound = await cleanupActivityPubReplayLedger('outbound', {
      batchSize: 1,
      maxBatches: 1,
      now,
    })
    expect(firstInbox).toMatchObject({ deleted: 1, hasMore: true })
    expect(firstOutbound).toMatchObject({ deleted: 1, hasMore: true })
    const secondInbox = await cleanupActivityPubReplayLedger('inbox', {
      batchSize: 1,
      maxBatches: 1,
      now,
    })
    const secondOutbound = await cleanupActivityPubReplayLedger('outbound', {
      batchSize: 1,
      maxBatches: 1,
      now,
    })
    expect(secondInbox).toMatchObject({ deleted: 1, hasMore: false })
    expect(secondOutbound).toMatchObject({ deleted: 1, hasMore: false })
    await using inspect = await beginTransaction()
    expect(await readFederationRetentionFixtureStateForTest(inspect, ids)).toMatchObject({
      inboxActivityIds: [ids.currentInboxActivityId],
      distributionActivityIds: [ids.unfinishedDistributionActivityId],
    })
  })
})
