import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { listCriticalAlertRecipientPage } from '@services/notifications/create-critical-moderation-alert-notification'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runCriticalAlertRecipientCapacityScenario(): Promise<void> {
  const scenario = 'critical-moderation-alert-recipients-at-cap'
  const limit = getPagedDispatchLimit('notifications_page_size')
  const background = 3_000
  const cohort = `explain-alert-recipient-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* seedExplainCriticalAlertRecipients */
    INSERT INTO users (username)
    SELECT ${cohort} || '-' || entry.n
    FROM generate_series(0, ${limit + 1 + background}::int) entry(n)
    RETURNING id`)
  const userIds = rows.map(row => row.id).toSorted()
  const [afterFirst, ...remaining] = userIds
  assert.ok(afterFirst)
  const recipients = remaining.slice(0, limit + 1)
  const unrelated = remaining.slice(limit + 1)
  assert.equal(unrelated.length, background)
  try {
    await write(sql`/* seedExplainCriticalAlertRoleMemberships */
      INSERT INTO user_roles (user_id, role_type_id)
      SELECT staff.user_id, role.id
      FROM unnest(${recipients}::uuid[]) WITH ORDINALITY AS staff(user_id, ordinal)
      CROSS JOIN user_role_types role
      WHERE (role.slug = 'administrator' AND staff.ordinal % 3 <> 1)
        OR (role.slug = 'moderator' AND staff.ordinal % 3 <> 2)
      UNION ALL
      SELECT person.user_id, role.id
      FROM unnest(${unrelated}::uuid[]) AS person(user_id)
      CROSS JOIN user_role_types role
      WHERE role.slug = 'investor'`)
    await write('/* analyzeExplainCriticalAlertRoleMemberships */ ANALYZE user_roles')
    registerScenarioContract(scenario, {
      seededRows: { user_roles: recipients.length * 2 + unrelated.length },
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'user_roles',
          max: recipients.length + Math.floor(recipients.length / 3),
          captureIndex: 0,
        },
        { kind: 'maxProcessedRows', relation: 'user_roles', max: 2, captureIndex: 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await listCriticalAlertRecipientPage(afterFirst, limit)
        assert.deepEqual(first, {
          recipientIds: recipients.slice(0, limit),
          nextAfterUserId: recipients[limit - 1],
        })
        const last = await listCriticalAlertRecipientPage(first.nextAfterUserId, limit)
        assert.deepEqual(last, { recipientIds: recipients.slice(limit), nextAfterUserId: null })
      },
      undefined,
      'listCriticalAlertRecipientPage',
    )
  } finally {
    await write(sql`/* cleanupExplainCriticalAlertRecipients */
      DELETE FROM users WHERE id = ANY(${userIds}::uuid[])`)
  }
}
