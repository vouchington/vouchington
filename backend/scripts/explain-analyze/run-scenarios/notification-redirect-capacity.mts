import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getNotificationRedirectTarget } from '@services/notifications/mutations'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runNotificationRedirectCapacity(): Promise<void> {
  const cohort = `explain-notification-redirect-${randomUUID()}`
  const now = Date.now()
  const notificationIds = Array.from({ length: 512 }, (_, index) =>
    seedUuidAtTimestamp(now, 5_760_000 + index),
  )
  const postIds = notificationIds.map((_, index) => seedUuid(index + 3_000, '05'))
  const target = notificationIds[255]!
  const ownerPath = '/posts/explain-redirect'
  const neighborPath = '/posts/explain-redirect-neighbor'
  await using seed = await beginTransaction()
  const { rows: recipients } = await seed<{ id: string }>(sql`/* seedExplainRedirectRecipients */
    INSERT INTO users (username) VALUES (${cohort}), (${`${cohort}-neighbor`}) RETURNING id`)
  assert.equal(recipients.length, 2)
  const [owner, neighbor] = recipients.map(recipient => recipient.id)
  assert.ok(owner && neighbor)
  await seed(sql`/* seedExplainRedirectNotifications */
    INSERT INTO notifications (user_id, id, entity_type, kind, post_id, target_path)
    SELECT recipient.id, item.id, 'post', 'post_new', item.post_id, recipient.path
    FROM (VALUES (${owner}::uuid, ${ownerPath}::text), (${neighbor}::uuid, ${neighborPath}::text))
      recipient(id, path)
    CROSS JOIN unnest(${notificationIds}::uuid[], ${postIds}::uuid[]) AS item(id, post_id)`)
  await seed.commit()

  try {
    const scenario = 'notification-redirect-target-at-cap'
    registerScenarioContract(scenario, {
      expectations: [{ kind: 'maxProcessedRows', relation: 'notifications', max: 2 }],
    })
    await runAndCapture(
      scenario,
      async () => {
        assert.equal(
          await getNotificationRedirectTarget(owner, target, { markRead: false }),
          ownerPath,
        )
        await assertReadRows([])
        assert.equal(
          await getNotificationRedirectTarget(owner, target, { markRead: true }),
          ownerPath,
        )
        await assertReadRows([{ user_id: owner, id: target }])
      },
      undefined,
      'getNotificationRedirectTarget',
      {
        afterCapture: async () => {
          await write(sql`/* restoreExplainRedirectTarget */ UPDATE notifications SET read_at = NULL
            WHERE user_id = ${owner} AND id = ${target}`)
        },
      },
    )
  } finally {
    await using cleanup = await beginTransaction()
    const ids = recipients.map(recipient => recipient.id)
    await cleanup(sql`/* cleanupExplainRedirectRecipients */
      DELETE FROM users WHERE id = ANY(${ids}::uuid[])`)
    await cleanup(sql`/* cleanupExplainRedirectIdentities */
      DELETE FROM retained_user_identities WHERE id = ANY(${ids}::uuid[])`)
    await cleanup.commit()
  }

  async function assertReadRows(expected: { user_id: string; id: string }[]) {
    const { rows } = await write<{ user_id: string; id: string; is_read: boolean }>(
      sql`/* readExplainRedirectState */
        SELECT user_id, id, read_at IS NOT NULL AS is_read
        FROM notifications WHERE user_id = ANY(${[owner, neighbor]}::uuid[])
        ORDER BY user_id, id`,
    )
    assert.deepEqual(
      rows.map(({ user_id, id }) => [user_id, id]),
      [owner, neighbor]
        .toSorted()
        .flatMap(id => notificationIds.map(notificationId => [id, notificationId])),
    )
    assert.deepEqual(
      rows.filter(row => row.is_read).map(({ user_id, id }) => ({ user_id, id })),
      expected,
    )
  }
}
