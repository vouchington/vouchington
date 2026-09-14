import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { backfillHistoricalPushEndpointOwnership } from '../../../test-helpers/data-stores/psql/notification-push-intents-migration.mts'

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
    const { active, owners } = await backfillHistoricalPushEndpointOwnership(ownerBackfillSql)
    expect(active).toEqual([{ endpoint: 'https://push.test/unique' }])
    expect(owners).toEqual([{ endpoint: 'https://push.test/unique' }])
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
