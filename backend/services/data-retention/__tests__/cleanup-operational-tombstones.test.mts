import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestExpiryWindow,
  getDeletedConversationDescendantCountsForTest,
  getOperationalHostnameBlockedForTest,
  getOperationalRetentionCursorForTest,
  insertDeletedConversationFixtureForTest,
  insertOperationalAttestationKeyForTest,
  insertOperationalHostnameBlockForTest,
  markDeletedConversationPushIntentTerminalForTest,
  operationalRowExistsForTest,
  resetOperationalRetentionCursorForTest,
} from '@voucha/test-helpers'
import { cleanupOperationalTombstones } from '../cleanup-operational-tombstones.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('operational tombstone retention', () => {
  it('pages lifted feed blocks while preserving active and recent blocks', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'feed_hostname_blocks')
    const first = await insertOperationalHostnameBlockForTest(query, {
      feed: true,
      liftedAt: window.firstEligibleDate,
    })
    const second = await insertOperationalHostnameBlockForTest(query, {
      feed: true,
      liftedAt: window.secondEligibleDate,
    })
    const recent = await insertOperationalHostnameBlockForTest(query, {
      feed: true,
      liftedAt: window.afterUpperBoundDate,
    })
    const active = await insertOperationalHostnameBlockForTest(query, {
      feed: true,
      liftedAt: null,
    })
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      lowerBoundDate: window.lowerBoundDate,
      borrowedQuery: query,
    }

    expect(await cleanupOperationalTombstones('feed_hostname_blocks', options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: first.id },
    })
    expect(await getOperationalRetentionCursorForTest(query, 'feed_hostname_blocks')).toMatchObject(
      {
        cursor_id: first.id,
      },
    )
    expect(await cleanupOperationalTombstones('feed_hostname_blocks', options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', second.id)).toBe(false)
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', recent.id)).toBe(true)
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', active.id)).toBe(true)
    expect(await getOperationalHostnameBlockedForTest(query, active.hostnameId)).toBe(true)
  })

  it('uses the longer window for lifted non-feed blocks', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate)
    now.setUTCDate(15)
    const cutoff = new Date(now)
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2)
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'other_hostname_blocks')
    const old = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(cutoff.getTime() - 60_000),
    })
    const recent = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(cutoff.getTime() + 60_000),
    })
    const result = await cleanupOperationalTombstones('other_hostname_blocks', {
      batchSize: 1,
      maxBatches: 1,
      now,
      lowerBoundDate: new Date(cutoff.getTime() - 120_000),
      borrowedQuery: query,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', old.id)).toBe(false)
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', recent.id)).toBe(true)
  })

  it('expires used and never-used attestation keys but retains a recently used key', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'app_attestation_keys')
    const used = await insertOperationalAttestationKeyForTest(query, {
      usedAt: window.firstEligibleDate,
    })
    const neverUsed = await insertOperationalAttestationKeyForTest(query, {
      usedAt: null,
      createdAt: window.secondEligibleDate,
    })
    const recent = await insertOperationalAttestationKeyForTest(query, {
      usedAt: window.afterUpperBoundDate,
    })
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 180 * DAY_MS),
      lowerBoundDate: window.lowerBoundDate,
      borrowedQuery: query,
    }
    expect(await cleanupOperationalTombstones('app_attestation_keys', options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: used },
    })
    expect(await cleanupOperationalTombstones('app_attestation_keys', options)).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(await operationalRowExistsForTest(query, 'app_attestation_keys', neverUsed)).toBe(false)
    expect(await operationalRowExistsForTest(query, 'app_attestation_keys', recent)).toBe(true)
  })

  it('drains every descendant before removing an old direct message conversation', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const old = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      channelType: 'direct_message',
      withChildren: true,
    })
    const active = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: null,
      channelType: 'direct_message',
      withChildren: true,
    })
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      lowerBoundDate: window.lowerBoundDate,
      borrowedQuery: query,
    }
    const counts = () => getDeletedConversationDescendantCountsForTest(query, old.id)
    expect(await counts()).toEqual({
      receipts: 1,
      intents: 1,
      notifications: 1,
      messages: 2,
      participants: 1,
    })

    expect(await cleanupOperationalTombstones('deleted_conversations', options)).toMatchObject({
      deleted: 0,
      hasMore: true,
    })
    expect((await counts()).receipts).toBe(0)
    expect((await counts()).intents).toBe(1)
    expect(await operationalRowExistsForTest(query, 'conversations', old.id)).toBe(true)

    await cleanupOperationalTombstones('deleted_conversations', options)
    expect((await counts()).intents).toBe(0)
    await cleanupOperationalTombstones('deleted_conversations', options)
    expect((await counts()).notifications).toBe(0)
    await cleanupOperationalTombstones('deleted_conversations', options)
    expect((await counts()).messages).toBe(1)
    await cleanupOperationalTombstones('deleted_conversations', options)
    expect((await counts()).messages).toBe(0)
    await cleanupOperationalTombstones('deleted_conversations', options)
    expect((await counts()).participants).toBe(0)
    expect(await operationalRowExistsForTest(query, 'conversations', old.id)).toBe(true)

    expect(await cleanupOperationalTombstones('deleted_conversations', options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: old.id },
    })
    expect(await operationalRowExistsForTest(query, 'conversations', old.id)).toBe(false)
    expect(await operationalRowExistsForTest(query, 'conversations', active.id)).toBe(true)
  })

  it('leaves a deleted conversation intact while its push intent is pending', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const pending = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      withChildren: true,
      pendingPush: true,
    })
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      lowerBoundDate: window.lowerBoundDate,
      borrowedQuery: query,
    }
    expect(await cleanupOperationalTombstones('deleted_conversations', options)).toEqual({
      deleted: 0,
      hasMore: false,
      continuation: null,
    })
    expect((await getDeletedConversationDescendantCountsForTest(query, pending.id)).messages).toBe(
      2,
    )
    await markDeletedConversationPushIntentTerminalForTest(
      query,
      pending.userId,
      pending.notificationId!,
    )
    expect(
      await cleanupOperationalTombstones('deleted_conversations', { ...options, maxBatches: 7 }),
    ).toMatchObject({ deleted: 1 })
    expect(await operationalRowExistsForTest(query, 'conversations', pending.id)).toBe(false)
  })

  it('leaves deleted modmail for the report-owned retention window', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const modmail = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      channelType: 'modmail',
    })
    expect(
      await cleanupOperationalTombstones('deleted_conversations', {
        batchSize: 1,
        maxBatches: 1,
        now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
        lowerBoundDate: window.lowerBoundDate,
        borrowedQuery: query,
      }),
    ).toEqual({ deleted: 0, hasMore: false, continuation: null })
    expect(await operationalRowExistsForTest(query, 'conversations', modmail.id)).toBe(true)
  })
})
