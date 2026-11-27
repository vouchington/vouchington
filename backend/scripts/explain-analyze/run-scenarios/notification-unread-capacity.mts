import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getUnreadNotificationsSummary } from '@services/notifications/list'
import { runAndCapture } from '../run-support.mts'
import { withNotificationInbox } from '../seed-data/notification-inbox.mts'

export async function runNotificationUnreadCapacityScenario(): Promise<void> {
  const limit = 20
  const unreadCount = 2_000
  await withNotificationInbox(
    { unread: unreadCount, backgroundRecipients: 40 },
    async ({ recipientId, notifications }) => {
      await write('/* analyzeUnreadCapacityFixture */ ANALYZE notifications')
      await runAndCapture(
        'notification-unread-summary-at-cap',
        async () => {
          const summary = await getUnreadNotificationsSummary(recipientId, limit)
          assert.equal(summary.unread_count, unreadCount)
          assert.deepEqual(
            summary.results.map(row => row.id),
            notifications.slice(0, limit).map(row => row.id),
          )
          assert.ok(summary.results.every(row => row.read_at === null))
        },
        undefined,
        'getUnreadNotificationsSummary',
      )
    },
  )
}
