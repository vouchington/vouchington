import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestManualPostNotification,
  createTestPost,
  createTestExpiryWindow,
  createTestUserDirect,
  getTestRetentionCursor,
  insertTestRetentionSession,
  insertTestRetentionReceipt,
  insertTestRetentionToken,
  insertTestRetentionTombstone,
  resetTestRetentionCursor,
  setTestRetentionTombstoneMicroseconds,
  testRetentionRowExists,
  testRetentionTombstoneExists,
} from '@voucha/test-helpers'
import {
  cleanupEmailAddressLoginTokens,
  cleanupExpiredUserSessions,
  cleanupPhoneNumberLoginTokens,
  cleanupWebPushSubscriptionTombstones,
} from '../cleanup-auth-sessions.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('auth and session retention', () => {
  it.each([
    ['email_address_login_tokens', cleanupEmailAddressLoginTokens],
    ['phone_number_login_tokens', cleanupPhoneNumberLoginTokens],
  ] as const)('resumes the %s UUIDv7 sweep from its persisted keyset', async (family, cleanup) => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + DAY_MS)
    await using query = await beginTransaction()
    await resetTestRetentionCursor(query, family)
    const first = await insertTestRetentionToken(query, family, window.firstEligibleDate)
    const second = await insertTestRetentionToken(query, family, window.secondEligibleDate)
    const recent = await insertTestRetentionToken(query, family, window.afterUpperBoundDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    const firstPage = await cleanup(options)
    expect(firstPage).toEqual({
      deleted: 1,
      hasMore: true,
      continuation: { at: null, id: first },
    })
    expect(await getTestRetentionCursor(query, family)).toMatchObject({ cursor_id: first })
    expect(await testRetentionRowExists(query, family, first)).toBe(false)
    expect(await testRetentionRowExists(query, family, second)).toBe(true)

    expect(await cleanup(options)).toEqual({ deleted: 1, hasMore: false, continuation: null })
    expect(await getTestRetentionCursor(query, family)).toMatchObject({ cursor_id: null })
    expect(await testRetentionRowExists(query, family, second)).toBe(false)
    expect(await testRetentionRowExists(query, family, recent)).toBe(true)
  })

  it('deletes expired active and revoked sessions through the expiry index', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 30 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    await using query = await beginTransaction()
    await resetTestRetentionCursor(query, 'user_sessions')
    const active = await insertTestRetentionSession(query, user.id, window.firstEligibleDate)
    const revoked = await insertTestRetentionSession(
      query,
      user.id,
      window.secondEligibleDate,
      window.secondEligibleDate,
    )
    const recent = await insertTestRetentionSession(query, user.id, window.afterUpperBoundDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    expect(await cleanupExpiredUserSessions(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { at: expect.any(String), id: active },
    })
    expect(await getTestRetentionCursor(query, 'user_sessions')).toMatchObject({
      cursor_id: active,
      cursor_at: window.firstEligibleDate,
    })
    expect(await cleanupExpiredUserSessions(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await testRetentionRowExists(query, 'user_sessions', revoked)).toBe(false)
    expect(await testRetentionRowExists(query, 'user_sessions', recent)).toBe(true)
  })

  it('resumes tombstone cleanup across pages while retaining recent subscriptions', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 90 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    await using query = await beginTransaction()
    await resetTestRetentionCursor(query, 'web_push_subscriptions')
    const first = await insertTestRetentionTombstone(query, user.id, window.firstEligibleDate)
    const second = await insertTestRetentionTombstone(query, user.id, window.secondEligibleDate)
    const recent = await insertTestRetentionTombstone(query, user.id, window.afterUpperBoundDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    expect(await cleanupWebPushSubscriptionTombstones(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { at: expect.any(String), id: first },
    })
    expect(await getTestRetentionCursor(query, 'web_push_subscriptions')).toMatchObject({
      cursor_id: first,
      cursor_user_id: user.id,
    })
    expect(await cleanupWebPushSubscriptionTombstones(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await testRetentionTombstoneExists(query, user.id, second)).toBe(false)
    expect(await testRetentionTombstoneExists(query, user.id, recent)).toBe(true)
  })

  it('advances past a receipt-protected tombstone to delete a later eligible row', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 90 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const post = await createTestPost({ user })
    const notificationId = await createTestManualPostNotification({
      userId: user.id,
      sentByUserId: user.id,
      postId: post.id,
    })
    await using query = await beginTransaction()
    await resetTestRetentionCursor(query, 'web_push_subscriptions')
    const protectedId = await insertTestRetentionTombstone(query, user.id, window.firstEligibleDate)
    const preciseDeletedAt = window.firstEligibleDate
      .toISOString()
      .replace(/\.\d{3}Z$/, '.123456+00')
    await setTestRetentionTombstoneMicroseconds(query, user.id, protectedId, preciseDeletedAt)
    const removableId = await insertTestRetentionTombstone(
      query,
      user.id,
      window.secondEligibleDate,
    )
    await insertTestRetentionReceipt(query, user.id, notificationId, protectedId)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    const protectedPage = await cleanupWebPushSubscriptionTombstones(options)
    expect(protectedPage).toMatchObject({
      deleted: 0,
      hasMore: true,
      continuation: { at: expect.any(String), id: protectedId },
    })
    expect(protectedPage.continuation?.at).toContain('.123456')
    expect(await cleanupWebPushSubscriptionTombstones(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await testRetentionTombstoneExists(query, user.id, protectedId)).toBe(true)
    expect(await testRetentionTombstoneExists(query, user.id, removableId)).toBe(false)
  })

  it('continues through equal tombstone timestamps and IDs owned by different users', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 90 * DAY_MS)
    const firstUser = await createTestUserDirect()
    const secondUser = await createTestUserDirect()
    if (!firstUser || !secondUser) throw new Error('Expected test users')
    const users = [firstUser.id, secondUser.id].toSorted()
    const sharedId = v7()
    await using query = await beginTransaction()
    await resetTestRetentionCursor(query, 'web_push_subscriptions')
    for (const userId of users) {
      await insertTestRetentionTombstone(query, userId, window.firstEligibleDate, sharedId)
    }
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    expect(await cleanupWebPushSubscriptionTombstones(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: sharedId, userId: users[0] },
    })
    expect(await testRetentionTombstoneExists(query, users[0]!, sharedId)).toBe(false)
    expect(await testRetentionTombstoneExists(query, users[1]!, sharedId)).toBe(true)
    expect(await cleanupWebPushSubscriptionTombstones(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await testRetentionTombstoneExists(query, users[1]!, sharedId)).toBe(false)
  })
})
