import { readFileSync } from 'node:fs'
import { beginTransaction } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'

const migrationSql = readFileSync(
  new URL('../migrations/0608-00-00-notification-push-intents.sql', import.meta.url),
  'utf8',
)
const retentionIndexMigrationSql = readFileSync(
  new URL('../migrations/0619-00-00-notification-push-intent-retention-index.sql', import.meta.url),
  'utf8',
)
const endpointOwnershipMigrationSql = readFileSync(
  new URL('../migrations/0624-00-00-web-push-endpoint-ownership.sql', import.meta.url),
  'utf8',
)
const ownerBackfillSql = migrationSection(
  'WITH ambiguous AS',
  'CREATE TABLE notification_push_intent_subscription_receipts',
)

describe('notification push intents migration', () => {
  it('does not infer undelivered legacy notifications from pushed_at', () => {
    expect(migrationSql).not.toMatch(
      /INSERT INTO notification_push_intents \(user_id, notification_id\)[\s\S]*?FROM notifications[\s\S]*?pushed_at IS NULL/u,
    )
  })

  it('adds terminal retention support without changing the applied table migration', () => {
    expect(migrationSql).not.toContain('idx_notification_push_intents__terminal_retention')
    expect(retentionIndexMigrationSql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_push_intents__terminal_retention',
    )
  })

  it('deactivates historical cross-account ownership before registry backfill', async () => {
    await using client = await beginTransaction()
    await client(sql`
        CREATE TEMP TABLE web_push_subscriptions (
          id UUID PRIMARY KEY, user_id UUID NOT NULL, endpoint TEXT NOT NULL,
          deleted_at TIMESTAMPTZ
        ) ON COMMIT DROP`)
    await client(sql`
        CREATE TEMP TABLE web_push_endpoint_owners (
          endpoint_digest BYTEA PRIMARY KEY, endpoint TEXT NOT NULL,
          user_id UUID NOT NULL, subscription_id UUID NOT NULL
        ) ON COMMIT DROP`)
    await client(sql`
        INSERT INTO web_push_subscriptions (id, user_id, endpoint, deleted_at) VALUES
          ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001', 'https://push.test/historical', '2026-01-01'),
          ('00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000002', 'https://push.test/historical', NULL),
          ('00000000-0000-7000-8000-000000000013', '00000000-0000-7000-8000-000000000003', 'https://push.test/unique', NULL)`)
    await client(ownerBackfillSql)

    const { rows: active } = await client<{ endpoint: string }>(sql`
        SELECT endpoint FROM web_push_subscriptions
        WHERE deleted_at IS NULL ORDER BY endpoint`)
    expect(active).toEqual([{ endpoint: 'https://push.test/unique' }])
    const { rows: owners } = await client<{ endpoint: string }>(sql`
        SELECT endpoint FROM web_push_endpoint_owners ORDER BY endpoint`)
    expect(owners).toEqual([{ endpoint: 'https://push.test/unique' }])
    await client.commit()
  })

  it('installs final exact-owner constraints and removes endpoint-keyed receipt state', () => {
    expect(endpointOwnershipMigrationSql).toContain(
      'CREATE CONSTRAINT TRIGGER trigger_assert_web_push_subscription_owner',
    )
    expect(endpointOwnershipMigrationSql).toContain(
      'CREATE CONSTRAINT TRIGGER trigger_assert_web_push_owner_subscription',
    )
    expect(endpointOwnershipMigrationSql).toContain(
      'DELETE FROM notification_push_intent_subscription_receipts',
    )
    expect(endpointOwnershipMigrationSql).toContain('DROP TABLE notification_push_intent_endpoints')
    expect(endpointOwnershipMigrationSql).not.toContain('WITH provable_receipts')
  })
})

function migrationSection(start: string, end: string) {
  const startIndex = endpointOwnershipMigrationSql.indexOf(start)
  const endIndex = endpointOwnershipMigrationSql.indexOf(end, startIndex)
  if (startIndex < 0 || endIndex < 0) throw new Error(`Missing migration section: ${start}`)
  return endpointOwnershipMigrationSql.slice(startIndex, endIndex)
}
