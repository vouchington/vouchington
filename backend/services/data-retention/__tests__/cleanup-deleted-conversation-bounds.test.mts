import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  attemptNotificationPushIntentConversationChangeForTest,
  createTestExpiryWindow,
  getDeletedConversationDescendantCountsForTest,
  getNotificationPushIntentConversationForTest,
  getOperationalRetentionCursorForTest,
  insertDeletedConversationFixtureForTest,
  insertDeletedConversationNotificationBacklogForTest,
  insertDeletedConversationNotificationForTest,
  moveNotificationConversationForTest,
  operationalRowExistsForTest,
  resetOperationalRetentionCursorForTest,
} from '@voucha/test-helpers'
import {
  cleanupOperationalTombstonesForTest,
  cleanupOperationalTombstonePageForTest,
} from '@voucha/test-helpers/operational-retention-scopes'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('bounded deleted conversation retention', () => {
  it('finishes an all-protected parent page without scanning past its cursor', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const protectedConversations: Array<{ id: string }> = []
    for (let index = 0; index < 16; index += 1)
      protectedConversations.push(
        await insertDeletedConversationFixtureForTest(query, {
          deletedAt: new Date(window.firstEligibleDate.getTime() + index),
          withChildren: true,
          pendingPush: true,
        }),
      )
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      ids: protectedConversations.map(conversation => conversation.id),
      borrowedQuery: query,
    }
    for (const protectedConversation of protectedConversations)
      expect(
        await cleanupOperationalTombstonesForTest('deleted_conversations', options),
      ).toMatchObject({
        deleted: 0,
        continuation: { id: protectedConversation.id },
      })
    expect(await cleanupOperationalTombstonesForTest('deleted_conversations', options)).toEqual({
      deleted: 0,
      hasMore: false,
      continuation: null,
    })
    for (const protectedConversation of protectedConversations)
      expect(
        (await getDeletedConversationDescendantCountsForTest(query, protectedConversation.id))
          .notifications,
      ).toBe(1)
  })

  it('keeps push intent context congruent with its notification', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    const first = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      withChildren: true,
      pendingPush: true,
    })
    const second = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.secondEligibleDate,
    })
    expect(
      await getNotificationPushIntentConversationForTest(
        query,
        first.userId,
        first.notificationId!,
      ),
    ).toBe(first.id)
    for (const invalidContext of [null, second.id]) {
      expect(
        await attemptNotificationPushIntentConversationChangeForTest(
          query,
          first.userId,
          first.notificationId!,
          invalidContext,
        ),
      ).toContain('Push intent conversation must match its notification')
    }
    expect(
      await moveNotificationConversationForTest(
        query,
        first.userId,
        first.notificationId!,
        second.id,
      ),
    ).toContain('Notification conversation cannot change after creation')
    expect(
      await getNotificationPushIntentConversationForTest(
        query,
        first.userId,
        first.notificationId!,
      ),
    ).toBe(first.id)
  })

  it('advances its raw parent cursor across protected conversations', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const first = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      withChildren: true,
      pendingPush: true,
    })
    const second = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.secondEligibleDate,
      withChildren: true,
      pendingPush: true,
    })
    const eligible = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: new Date(window.secondEligibleDate.getTime() + 1),
    })
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      ids: [first.id, second.id, eligible.id],
      borrowedQuery: query,
    }
    for (const protectedConversation of [first, second]) {
      expect(await cleanupOperationalTombstonesForTest('deleted_conversations', options)).toEqual({
        deleted: 0,
        hasMore: true,
        continuation: { at: expect.any(String), id: protectedConversation.id },
      })
      expect(
        await getOperationalRetentionCursorForTest(query, 'deleted_conversations'),
      ).toMatchObject({
        cursor_record_id: protectedConversation.id,
      })
    }
    expect(
      await cleanupOperationalTombstonesForTest('deleted_conversations', options),
    ).toMatchObject({
      deleted: 1,
      continuation: { id: eligible.id },
    })
    expect(await operationalRowExistsForTest(query, 'conversations', first.id)).toBe(true)
    expect(await operationalRowExistsForTest(query, 'conversations', second.id)).toBe(true)
    expect(await operationalRowExistsForTest(query, 'conversations', eligible.id)).toBe(false)
  })

  it('keeps every descendant when a late notification push is pending', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const protectedConversation = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
      withChildren: true,
    })
    await insertDeletedConversationNotificationBacklogForTest(query, protectedConversation, 128)
    const before = await getDeletedConversationDescendantCountsForTest(
      query,
      protectedConversation.id,
    )
    const result = await cleanupOperationalTombstonesForTest('deleted_conversations', {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      ids: [protectedConversation.id],
      borrowedQuery: query,
    })
    expect(result).toMatchObject({ deleted: 0, continuation: { id: protectedConversation.id } })
    expect(
      await getDeletedConversationDescendantCountsForTest(query, protectedConversation.id),
    ).toEqual(before)
  })

  it('drains one notification identity at a time before deleting a conversation', async () => {
    const window = createTestExpiryWindow()
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'deleted_conversations')
    const conversation = await insertDeletedConversationFixtureForTest(query, {
      deletedAt: window.firstEligibleDate,
    })
    for (let index = 0; index < 4; index += 1)
      await insertDeletedConversationNotificationForTest(query, conversation)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
      ids: [conversation.id],
      borrowedQuery: query,
    }
    for (let remaining = 3; remaining >= 0; remaining -= 1) {
      expect(
        await cleanupOperationalTombstonesForTest('deleted_conversations', options),
      ).toMatchObject({
        deleted: 0,
        hasMore: true,
      })
      expect(
        (await getDeletedConversationDescendantCountsForTest(query, conversation.id)).notifications,
      ).toBe(remaining)
    }
    expect(
      await cleanupOperationalTombstonesForTest('deleted_conversations', options),
    ).toMatchObject({
      deleted: 1,
      continuation: { id: conversation.id },
    })
  })

  it.each(['intent', 'notification'] as const)(
    'keeps a conversation and its children when the first %s is locked',
    async lockedTable => {
      const window = createTestExpiryWindow()
      const conversation = await (async () => {
        await using setup = await beginTransaction()
        const fixture = await insertDeletedConversationFixtureForTest(setup, {
          deletedAt: window.firstEligibleDate,
          withChildren: true,
        })
        await setup.commit()
        return fixture
      })()
      await using blocker = await beginTransaction()
      try {
        if (lockedTable === 'intent') {
          await blocker(
            `/* lockDeletedConversationIntentForTest */
             SELECT 1 FROM notification_push_intents
             WHERE user_id = $1::uuid AND notification_id = $2::uuid FOR UPDATE`,
            [conversation.userId, conversation.notificationId],
          )
        } else {
          await blocker(
            `/* lockDeletedConversationNotificationForTest */
             SELECT 1 FROM notifications
             WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
            [conversation.userId, conversation.notificationId],
          )
        }
        const descendants = await getDeletedConversationDescendantCountsForTest(
          blocker,
          conversation.id,
        )
        await using sweep = await beginTransaction()
        expect(
          await cleanupOperationalTombstonePageForTest('deleted_conversations', {
            batchSize: 1,
            borrowedQuery: sweep,
            ids: [conversation.id],
            now: new Date(window.upperBoundDate.getTime() + 30 * DAY_MS),
          }),
        ).toMatchObject({ deleted: 0, hasMore: true, stalled: true })
        expect(await operationalRowExistsForTest(blocker, 'conversations', conversation.id)).toBe(
          true,
        )
        expect(
          await getDeletedConversationDescendantCountsForTest(blocker, conversation.id),
        ).toEqual(descendants)
      } finally {
        await blocker.commit()
        await using cleanup = await beginTransaction()
        await cleanup(
          '/* deleteLockedConversationForTest */ DELETE FROM conversations WHERE id = $1::uuid',
          [conversation.id],
        )
        await cleanup(
          '/* deleteLockedConversationUserForTest */ DELETE FROM users WHERE id = $1::uuid',
          [conversation.userId],
        )
        await cleanup.commit()
      }
    },
  )
})
