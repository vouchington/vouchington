import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { claimNotificationPushIntent } from '@services/notifications-push/push-intents'
import { NOTIFICATION_PUSH_INTENT_LEASE_SECONDS } from '@services/notifications-push/push-intent-delivery-policy'
import { extractQueryName, getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const pushIntentBackgroundSize = 5_000

type PushState = {
  notification_id: string
  status: 'pending' | 'delivered' | 'suppressed'
  lease_token: string | null
  leased_at: Date | null
  lease_expires_at: Date | null
  delivered_at: Date | null
  suppressed_at: Date | null
  pushed_at: Date | null
}

async function prepareClaimTargets(userId: string, fixtureNotificationIds: string[]) {
  const [expired, terminal, deleted, stale] = fixtureNotificationIds
  assert.ok(expired && terminal && deleted && stale)
  const {
    rows: [current],
  } = await write<{ id: string }>(sql`/* seedExplainPushNewGeneration */
    UPDATE notifications SET id = uuidv7()
    WHERE user_id = ${userId} AND id = ${stale}
    RETURNING id
  `)
  assert.ok(current)
  await write(sql`/* seedExplainPushNotificationStates */
    UPDATE notifications
    SET pushed_at = CASE WHEN id = ${deleted} THEN NULL ELSE CURRENT_TIMESTAMP - INTERVAL '1 hour' END,
      deleted_at = CASE WHEN id = ${deleted} THEN CURRENT_TIMESTAMP END,
      delete_reason = CASE WHEN id = ${deleted} THEN 'user_deleted'::notification_delete_reasons END
    WHERE user_id = ${userId} AND id = ANY(${[expired, terminal, deleted]}::uuid[])
  `)
  await write(sql`/* seedExplainPushIntentStates */
    UPDATE notification_push_intents
    SET lease_token = CASE WHEN notification_id = ${expired} THEN uuidv7() END,
      leased_at = CASE WHEN notification_id = ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '1 hour' END,
      lease_expires_at = CASE WHEN notification_id = ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '58 minutes' END,
      delivered_at = CASE WHEN notification_id = ${terminal} THEN CURRENT_TIMESTAMP - INTERVAL '1 hour' END
    WHERE user_id = ${userId} AND notification_id = ANY(${[expired, terminal]}::uuid[])
  `)
  return { expired, terminal, deleted, stale, current: current.id }
}

async function readStates(userId: string, notificationIds: string[]) {
  const { rows } = await write<PushState>(sql`/* verifyExplainPushIntentStates */
    SELECT intent.notification_id, intent.status, intent.lease_token, intent.leased_at,
      intent.lease_expires_at, intent.delivered_at, intent.suppressed_at, notification.pushed_at
    FROM notification_push_intents intent
    JOIN notifications notification
      ON notification.user_id = intent.user_id AND notification.id = intent.notification_id
    WHERE intent.user_id = ${userId} AND intent.notification_id = ANY(${notificationIds}::uuid[])
  `)
  return new Map(rows.map(row => [row.notification_id, row]))
}

async function restorePushIntents(userId: string, expired: PushState, deletedId: string) {
  // The expired notification keeps its original pushed_at. Only these two intent rows changed.
  await write(sql`/* restoreExplainPushExpiredIntent */
    UPDATE notification_push_intents
    SET lease_token = ${expired.lease_token}, leased_at = ${expired.leased_at},
      lease_expires_at = ${expired.lease_expires_at}
    WHERE user_id = ${userId} AND notification_id = ${expired.notification_id}
  `)
  await write(sql`/* restoreExplainPushDeletedIntent */
    UPDATE notification_push_intents
    SET suppressed_at = NULL
    WHERE user_id = ${userId} AND notification_id = ${deletedId}
  `)
}

async function capturePushClaim(
  userId: string,
  targets: Awaited<ReturnType<typeof prepareClaimTargets>>,
) {
  const scenario = 'notification-push-intent-claim-at-cap'
  const queryName = 'claimNotificationPushIntent'
  const scope = [targets.expired, targets.deleted, targets.terminal, targets.stale, targets.current]
  const before = await readStates(userId, scope)
  const previous = before.get(targets.expired)
  assert.equal(before.size, 4)
  assert.ok(previous?.lease_token && previous.lease_expires_at)
  assert.equal(before.get(targets.terminal)?.status, 'delivered')
  assert.equal(before.get(targets.current)?.status, 'pending')
  assert.ok(!before.has(targets.stale))

  registerScenarioContract(scenario, {
    // Each replay targets one job. Stale and completed jobs legitimately return zero rows.
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'notifications', max: 4 },
      { kind: 'maxProcessedRows', relation: 'notification_push_intents', max: 4 },
    ],
    forbidSequentialScans: ['notifications', 'notification_push_intents'],
  })
  await runAndCapture(
    scenario,
    async () => {
      const claim = (notificationId: string) =>
        claimNotificationPushIntent(
          { user_id: userId, notification_id: notificationId },
          NOTIFICATION_PUSH_INTENT_LEASE_SECONDS,
        )
      const [reclaimed, terminal, deleted, stale] = await Promise.all([
        claim(targets.expired),
        claim(targets.terminal),
        claim(targets.deleted),
        claim(targets.stale),
      ])
      assert.equal(reclaimed?.user_id, userId)
      assert.equal(reclaimed.notification_id, targets.expired)
      assert.notEqual(reclaimed.lease_token, previous.lease_token)
      assert.deepEqual([terminal, deleted, stale], [undefined, undefined, undefined])

      const after = await readStates(userId, scope)
      const pending = after.get(targets.expired)
      assert.ok(pending?.leased_at && pending.lease_expires_at)
      assert.equal(pending.status, 'pending')
      assert.equal(pending.lease_token, reclaimed.lease_token)
      assert.equal(
        pending.lease_expires_at.getTime() - pending.leased_at.getTime(),
        NOTIFICATION_PUSH_INTENT_LEASE_SECONDS * 1_000,
      )
      assert.deepEqual(pending.pushed_at, previous.pushed_at)
      assert.equal(after.get(targets.deleted)?.status, 'suppressed')
      assert.equal(after.get(targets.deleted)?.pushed_at, null)
      assert.deepEqual(after.get(targets.terminal), before.get(targets.terminal))
      assert.deepEqual(after.get(targets.current), before.get(targets.current))
      assert.equal(after.size, before.size)
      assert.ok(!after.has(targets.stale))
      assert.equal(
        getCapturedQueries().filter(query => extractQueryName(query.text) === queryName).length,
        4,
      )
    },
    undefined,
    queryName,
    { afterCapture: () => restorePushIntents(userId, previous, targets.deleted) },
  )
}

export async function runNotificationPushIntentClaimCapacity() {
  const {
    rows: [user],
  } = await write<{ id: string }>(sql`/* seedExplainPushClaimRecipient */
    INSERT INTO users (username) VALUES (${`explain-push-${randomUUID()}`}) RETURNING id
  `)
  assert.ok(user)
  try {
    const postIds = Array.from({ length: pushIntentBackgroundSize + 4 }, (_, index) =>
      seedUuid(index, '05'),
    )
    // The production notification trigger creates one durable intent for each seeded row.
    const { rows } = await write<{
      id: string
      post_id: string
    }>(sql`/* seedExplainPushClaimInbox */
      INSERT INTO notifications (user_id, entity_type, kind, post_id, target_path)
      SELECT ${user.id}, 'post', 'post_new', post_id, '/posts/explain-push-intent'
      FROM unnest(${postIds}::uuid[]) AS fixture(post_id)
      ORDER BY post_id
      RETURNING id, post_id
    `)
    assert.equal(rows.length, postIds.length)
    const inbox = new Map(rows.map(row => [row.post_id, row.id]))
    const targets = await prepareClaimTargets(
      user.id,
      postIds.slice(0, 4).map(id => inbox.get(id)!),
    )
    await capturePushClaim(user.id, targets)
  } finally {
    await write(sql`/* cleanupExplainPushClaimRecipient */ DELETE FROM users WHERE id = ${user.id}`)
  }
}
