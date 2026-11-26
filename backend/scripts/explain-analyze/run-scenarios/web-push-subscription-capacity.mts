import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { listWebPushSubscriptionsPage } from '@services/notifications/push-subscriptions'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runWebPushSubscriptionCapacityScenario(): Promise<void> {
  const scenario = 'web-push-subscriptions-at-cap'
  const limit = 100 // Settings route ceiling in api/v1/my/notifications.mts.
  const ownerCount = 1_000
  const activePerBackgroundOwner = 5
  const inactiveGenerations = 300
  const cohort = `explain-web-push-${randomUUID()}`
  const { rows: users } = await write<{ id: string }>(sql`/* seedExplainWebPushUsers */
    INSERT INTO users (username)
    SELECT ${cohort} || '-' || entry.ordinal FROM generate_series(0, ${ownerCount}::int) entry(ordinal)
    RETURNING id`)
  assert.equal(users.length, ownerCount + 1)
  const [target, ...background] = users
  assert.ok(target)
  try {
    const { rows: owners } = await write<{ user_id: string; subscription_id: string }>(sql`
      /* seedExplainWebPushSubscriptions */
      WITH fixture (user_id, ordinal, active) AS (
        SELECT ${target.id}::uuid, ordinal, ordinal <= ${limit + 1}
        FROM generate_series(1, ${limit + 1 + inactiveGenerations}::int) entry(ordinal)
        UNION ALL
        SELECT background.id, entry.ordinal, true
        FROM unnest(${background.map(owner => owner.id)}::uuid[]) background(id)
        CROSS JOIN generate_series(1, ${activePerBackgroundOwner}::int) entry(ordinal)
      ), subscriptions AS (
        INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, deleted_at)
        SELECT fixture.user_id, ${`https://push.example.test/${cohort}/`} || fixture.user_id || '/' || fixture.ordinal,
          repeat('a', 16), repeat('b', 8),
          CASE WHEN NOT fixture.active THEN CURRENT_TIMESTAMP END
        FROM fixture
        RETURNING user_id, id, endpoint, deleted_at
      )
      INSERT INTO web_push_endpoint_owners (endpoint_digest, endpoint, user_id, subscription_id)
      SELECT digest(endpoint, 'sha256'), endpoint, user_id, id
      FROM subscriptions WHERE subscriptions.deleted_at IS NULL
      RETURNING user_id, subscription_id`)
    assert.equal(owners.length, ownerCount * activePerBackgroundOwner + limit + 1)
    await write(
      '/* analyzeExplainWebPushSubscriptions */ ANALYZE web_push_subscriptions, web_push_endpoint_owners',
    )
    const expected = owners
      .filter(owner => owner.user_id === target.id)
      .map(owner => owner.subscription_id)
      .toSorted()
      .toReversed()
    assert.equal(expected.length, limit + 1)
    registerScenarioContract(scenario, {
      seededRows: {
        web_push_subscriptions: owners.length + inactiveGenerations,
        web_push_endpoint_owners: owners.length,
      },
      expectations: [
        // Main can examine inactive generations and all active owners. https://github.com/vouchington/vouchington/issues/6584
        {
          kind: 'maxProcessedRows',
          relation: 'web_push_subscriptions',
          max: limit + 1 + inactiveGenerations,
          captureIndex: 0,
        },
        { kind: 'maxProcessedRows', relation: 'web_push_subscriptions', max: 1, captureIndex: 1 },
        { kind: 'maxProcessedRows', relation: 'web_push_endpoint_owners', max: limit + 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await listWebPushSubscriptionsPage(target.id, { limit })
        assert.deepEqual(
          first.results.map(subscription => subscription.id),
          expected.slice(0, limit),
        )
        assert.equal(first.page_info.has_next_page, true)
        assert.ok(first.page_info.end_cursor)
        const last = await listWebPushSubscriptionsPage(target.id, {
          limit,
          after: first.page_info.end_cursor,
        })
        assert.deepEqual(
          last.results.map(subscription => subscription.id),
          expected.slice(limit),
        )
        assert.equal(last.page_info.has_next_page, false)
        assert.equal(last.page_info.end_cursor, null)
      },
      undefined,
      'listWebPushSubscriptions',
    )
  } finally {
    await write(sql`/* cleanupExplainWebPushUsers */
      DELETE FROM users WHERE id = ANY(${users.map(user => user.id)}::uuid[])`)
  }
}
