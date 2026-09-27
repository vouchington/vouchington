import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  new URL('../migrations/0608-00-00-notification-push-intents.sql', import.meta.url),
  'utf8',
)
const endpointOwnershipMigrationSql = readFileSync(
  new URL('../migrations/0624-00-00-web-push-endpoint-ownership.sql', import.meta.url),
  'utf8',
)

describe('notification push intents migration', () => {
  it('creates intents only for new notifications', () => {
    expect(migrationSql).not.toMatch(
      /INSERT INTO notification_push_intents \(user_id, notification_id\)[\s\S]*?FROM notifications[\s\S]*?pushed_at IS NULL/u,
    )
  })

  it('adds terminal retention support', () => {
    expect(migrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_notification_push_intents__terminal_retention',
    )
  })

  it('installs final exact-owner constraints and subscription-keyed receipt state', () => {
    expect(endpointOwnershipMigrationSql).toContain(
      'CREATE CONSTRAINT TRIGGER trigger_assert_web_push_subscription_owner',
    )
    expect(endpointOwnershipMigrationSql).toContain(
      'CREATE CONSTRAINT TRIGGER trigger_assert_web_push_owner_subscription',
    )
    expect(endpointOwnershipMigrationSql).toContain(
      'CREATE TABLE notification_push_intent_subscription_receipts',
    )
    expect(endpointOwnershipMigrationSql).toContain(
      'PRIMARY KEY (user_id, notification_id, subscription_id)',
    )
  })
})
