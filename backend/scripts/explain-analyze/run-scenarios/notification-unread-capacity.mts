import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getUnreadNotificationsSummary } from '@services/notifications/list'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runNotificationUnreadCapacityScenario(): Promise<void> {
  const limit = 20
  // Give the shared partition multiple recipients while leaving the target's 2,000 unread rows intact.
  const recipientIds = Array.from({ length: 40 }, (_, index) => seedUuid(index + 10, '01'))
  const notificationIds = Array.from({ length: 500 }, (_, index) => seedUuid(index, 'ed'))
  const postIds = notificationIds.map((_, index) => seedUuid(index + 3_000, '05'))
  await write(sql`/* seedUnreadCapacityOtherRecipients */
    INSERT INTO notifications (user_id, id, entity_type, kind, post_id, target_path)
    SELECT recipient.user_id, fixture.id, 'post', 'post_new', fixture.post_id, '/posts/explain-unread-capacity'
    FROM unnest(${recipientIds}::uuid[]) AS recipient(user_id)
    CROSS JOIN unnest(${notificationIds}::uuid[], ${postIds}::uuid[]) AS fixture(id, post_id)`)
  try {
    await write('/* analyzeUnreadCapacityFixture */ ANALYZE notifications')
    await runAndCapture(
      'notification-unread-summary-at-cap',
      async () => {
        const summary = await getUnreadNotificationsSummary(seedUser.id, limit)
        assert.equal(summary.results.length, limit)
        assert.equal(summary.unread_count, 2_000)
        const ids = summary.results.map(row => row.id)
        assert.deepEqual(ids, ids.toSorted().toReversed())
        assert.ok(summary.results.every(row => row.read_at === null))
      },
      undefined,
      'getUnreadNotificationsSummary',
    )
  } finally {
    await write(sql`/* deleteUnreadCapacityOtherRecipients */
      DELETE FROM notifications
      WHERE user_id = ANY(${recipientIds}::uuid[]) AND id = ANY(${notificationIds}::uuid[])`)
  }
}
