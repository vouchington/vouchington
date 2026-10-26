import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestNotificationEmailRetentionCursor,
  insertTestModerationSend,
  testNotificationEmailRetentionRowExists,
} from '@voucha/test-helpers'
import { cleanupModerationEmailSends } from '../cleanup-notification-email.mts'

describe('moderation send retention without a cursor', () => {
  it('deletes the next oldest page across capped invocations without storing a cursor', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const now = new Date('2000-02-02T00:00:00.000Z')
    await using query = await beginTransaction()
    const first = await insertTestModerationSend(query, user.id, new Date('2000-01-01T00:00:00Z'))
    const second = await insertTestModerationSend(query, user.id, new Date('2000-01-02T00:00:00Z'))
    const recent = await insertTestModerationSend(query, user.id, new Date('2000-01-05T00:00:00Z'))
    const options = { batchSize: 1, maxBatches: 1, now, borrowedQuery: query }

    expect(await cleanupModerationEmailSends(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: first },
    })
    expect(
      await getTestNotificationEmailRetentionCursor(query, 'moderation_email_sends'),
    ).toBeNull()
    expect(await cleanupModerationEmailSends(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(
      await getTestNotificationEmailRetentionCursor(query, 'moderation_email_sends'),
    ).toBeNull()
    expect(
      await testNotificationEmailRetentionRowExists(query, 'user_moderation_email_sends', first),
    ).toBe(false)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'user_moderation_email_sends', second),
    ).toBe(false)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'user_moderation_email_sends', recent),
    ).toBe(true)
  })
})
