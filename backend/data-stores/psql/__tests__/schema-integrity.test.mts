import { afterAll, describe, expect, it } from 'vitest'
import {
  getCanonicalDuplicateIndexes,
  getCuratedAsideForeignKeys,
  getModerationResolverForeignKeys,
  getRemovedTablePresence,
  getUnvalidatedPublicConstraints,
  hasCuratedAsideSingleTargetConstraint,
} from '../../../test-helpers/data-stores/psql/schema-integrity.mts'
import { onGracefulShutdown } from '../index.mts'
import {
  getAdministratorRefundIdentityState,
  getMembershipRefundOperationConstraintState,
} from '../../../test-helpers/data-stores/psql/schema-membership-refund-integrity.mts'

describe('PostgreSQL schema integrity', () => {
  afterAll(onGracefulShutdown)

  it('has no unvalidated public constraints', async () => {
    const constraints = await getUnvalidatedPublicConstraints()
    expect(constraints.map(row => `${row.table_name}.${row.constraint_name}`)).toEqual([])
  })

  it('has no canonical duplicate indexes', async () => {
    const indexes = await getCanonicalDuplicateIndexes()
    expect(indexes.map(row => `${row.table_name}: ${row.index_names}`)).toEqual([])
  })

  it('keeps retired tables absent', async () => {
    const removedTables = [
      'conversation_message_rag',
      'crm_contact_lifecycle_changes',
      'crm_contact_social_accounts',
      'crm_contacts',
      'membership_refund_intents',
      'recently_viewed_landing_pages',
      'support_agent_runs',
      'support_contacts',
      'support_inbound_email_message_ids',
      'support_inbound_email_receipts',
      'support_message_lifecycle_changes',
      'support_messages',
      'support_thread_lifecycle_changes',
      'support_threads',
      'topics__bank_accounts',
      'wikipedia_topic_recommendations',
    ]
    await expect(getRemovedTablePresence(removedTables)).resolves.toEqual(
      removedTables.map(table_name => ({ table_name, relation: null })),
    )
  })

  it('uses concrete curated-aside foreign keys with intentional deletion rules', async () => {
    const foreignKeys = await getCuratedAsideForeignKeys()
    expect(
      foreignKeys.map(row => `${row.column_name}:${row.target_table}:${row.delete_rule}`),
    ).toEqual([
      'community_id:communities:CASCADE',
      'created_by_id:users:SET NULL',
      'rss_feed_id:rss_feeds:CASCADE',
      'topic_id:topics:CASCADE',
    ])
    await expect(hasCuratedAsideSingleTargetConstraint()).resolves.toBe(true)
  })

  it('uses SET NULL for moderation resolver foreign keys', async () => {
    const foreignKeys = await getModerationResolverForeignKeys([
      'moderation_reports',
      'review_disputes',
    ])
    expect(foreignKeys.map(row => `${row.table_name}:${row.delete_rule}`)).toEqual([
      'moderation_reports:SET NULL',
      'review_disputes:SET NULL',
    ])
  })

  it('ties administrator receipts to their durable operation and request', async () => {
    await expect(getMembershipRefundOperationConstraintState()).resolves.toEqual({
      hasExpectedConstraints: true,
      hasAdministratorRequestReference: true,
      hasOperationSourceReference: true,
      hasRestrictiveDeletion: true,
    })
  })

  it('requires durable identity for admin refunds', async () => {
    await expect(getAdministratorRefundIdentityState()).resolves.toEqual({
      hasExpectedConstraint: true,
      requiresAdministratorSource: true,
      requiresIssuer: true,
      requiresIdempotencyKey: true,
      requiresRequestFingerprint: true,
      excludesRetiredIdempotencyFlag: true,
    })
  })
})
