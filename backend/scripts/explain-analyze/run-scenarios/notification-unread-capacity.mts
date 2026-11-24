import assert from 'node:assert/strict'
import { getUnreadNotificationsSummary } from '@services/notifications/list'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runNotificationUnreadCapacityScenario(): Promise<void> {
  const limit = 20
  await runAndCapture(
    'notification-unread-summary-at-cap',
    async () => {
      const summary = await getUnreadNotificationsSummary(seedUser.id, limit)
      assert.equal(summary.results.length, limit)
      assert.ok(summary.unread_count >= 2_000, 'expected the shared 2,000-row unread fixture')
      const ids = summary.results.map(row => row.id)
      assert.deepEqual(ids, ids.toSorted().toReversed())
      assert.ok(summary.results.every(row => row.read_at === null))
    },
    undefined,
    'getUnreadNotificationsSummary',
  )
}
