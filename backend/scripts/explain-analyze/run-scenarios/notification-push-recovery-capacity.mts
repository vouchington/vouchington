import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { listAvailableNotificationPushIntents } from '@services/notifications-push/push-intent-recovery'
import { getNotificationsWorkLimit } from '@services/notifications/work-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runNotificationPushRecoveryCapacityScenario(): Promise<void> {
  const scenario = 'notification-push-recovery-at-cap'
  const limit = getNotificationsWorkLimit('push_intent_recovery_page_size')
  const activeLeases = 1_000
  const futureIntents = 1_000
  const terminalIntents = 4_000
  const eligible = limit + 1
  const scanBefore = '2001-01-02 00:00:00+00'
  const {
    rows: [user],
  } = await write<{ id: string }>(sql`/* seedExplainPushRecoveryRecipient */
    INSERT INTO users (username) VALUES (${`explain-recovery-${randomUUID()}`}) RETURNING id`)
  assert.ok(user)
  try {
    const postIds = Array.from(
      { length: eligible + activeLeases + futureIntents + terminalIntents },
      (_, index) => seedUuid(index, '05'),
    )
    const { rows } = await write<{
      id: string
      post_id: string
    }>(sql`/* seedExplainPushRecoveryInbox */
      INSERT INTO notifications (user_id, entity_type, kind, post_id, target_path)
      SELECT ${user.id}, 'post', 'post_new', post_id, '/posts/explain-push-recovery'
      FROM unnest(${postIds}::uuid[]) AS fixture(post_id)
      RETURNING id, post_id`)
    assert.equal(rows.length, postIds.length)
    const inbox = new Map(rows.map(row => [row.post_id, row.id]))
    const notificationIds = postIds.map(postId => inbox.get(postId)!)
    // The notification trigger creates intents with the current timestamp. Recreate the
    // fixture's intents with a private historical watermark and an intentional timestamp tie.
    await write(sql`/* replaceExplainPushRecoveryIntents */
      DELETE FROM notification_push_intents WHERE user_id = ${user.id}`)
    await write(sql`/* seedExplainPushRecoveryIntents */
      INSERT INTO notification_push_intents
        (user_id, notification_id, updated_at, lease_token, leased_at, lease_expires_at, delivered_at)
      SELECT ${user.id}, fixture.id,
        CASE WHEN fixture.ordinal <= ${activeLeases} THEN TIMESTAMPTZ '2001-01-01'
          WHEN fixture.ordinal <= ${activeLeases + eligible} THEN TIMESTAMPTZ '2001-01-02'
          ELSE TIMESTAMPTZ '2001-01-03' END,
        CASE WHEN fixture.ordinal <= ${activeLeases + 1} THEN uuidv7() END,
        CASE WHEN fixture.ordinal <= ${activeLeases + 1} THEN CURRENT_TIMESTAMP - INTERVAL '1 hour' END,
        CASE WHEN fixture.ordinal <= ${activeLeases} THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
          WHEN fixture.ordinal = ${activeLeases + 1} THEN CURRENT_TIMESTAMP - INTERVAL '58 minutes' END,
        CASE WHEN fixture.ordinal > ${activeLeases + eligible + futureIntents} THEN CURRENT_TIMESTAMP END
      FROM unnest(${notificationIds}::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)`)
    await write('/* analyzeExplainPushRecoveryIntents */ ANALYZE notification_push_intents')
    const expected = notificationIds.slice(activeLeases, activeLeases + eligible).toSorted()
    registerScenarioContract(scenario, {
      expectations: [
        // Generic continuation rereads the visited prefix. https://github.com/vouchington/vouchington/issues/6546
        {
          kind: 'maxProcessedRows',
          relation: 'notification_push_intents',
          max: activeLeases + eligible,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await listAvailableNotificationPushIntents(limit, { scanBefore })
        assert.deepEqual(
          first.map(intent => intent.notification_id),
          expected.slice(0, limit),
        )
        const lastOnFirst = first.at(-1)!
        assert.equal(Date.parse(lastOnFirst.scan_before), Date.parse(scanBefore))
        const second = await listAvailableNotificationPushIntents(limit, {
          scanBefore: lastOnFirst.scan_before,
          after: {
            updatedAt: lastOnFirst.updated_at,
            userId: lastOnFirst.user_id,
            notificationId: lastOnFirst.notification_id,
          },
        })
        assert.deepEqual(
          second.map(intent => intent.notification_id),
          expected.slice(limit),
        )
        assert.equal(second[0]?.user_id, user.id)
      },
      undefined,
      'listAvailableNotificationPushIntents',
    )
  } finally {
    await write(
      sql`/* cleanupExplainPushRecoveryRecipient */ DELETE FROM users WHERE id = ${user.id}`,
    )
  }
}
