import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  buildMembershipChangesInsert,
  buildLatestMembershipChangeUpdate,
} from '@services/memberships/membership-change-statements'
import { buildMembershipEntitlementEffectsInsert } from '@services/memberships/entitlement-effects'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

// Fixed, isolated history rows let each actual production statement run and replay inside rolled
// back transactions. The seed is idempotent and never mutates append-only history.
export async function runMembershipChangeScenarios(): Promise<void> {
  // Supply enough ordinary rows for the planner to price selective lookups realistically.
  const population = Array.from({ length: 3_000 }, (_, index) => 10_000 + index)
  const populationUsers = population.map(index => seedUuid(index, '01'))
  const populationSources = population.map(index => seedUuid(index, '33'))
  const populationMemberships = population.map(index => seedUuid(index, '31'))
  const populationGrants = population.map(index => seedUuid(index, '3a'))
  const populationChanges = population.map(index => seedUuid(index, '3b'))
  await write(sql`/* seedExplainMembershipChanges:populationSources */
    INSERT INTO membership_sources (id, user_id, source_kind)
    SELECT source_id, user_id, 'admin_grant'
    FROM unnest(${populationSources}::uuid[], ${populationUsers}::uuid[]) AS input(source_id, user_id)
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:populationMemberships */
    INSERT INTO memberships (id, user_id, membership_source_id, membership_product_id, effective_at)
    SELECT input.membership_id, input.user_id, input.source_id, fixture.membership_product_id, now()
    FROM unnest(${populationMemberships}::uuid[], ${populationUsers}::uuid[], ${populationSources}::uuid[])
      AS input(membership_id, user_id, source_id)
    CROSS JOIN (SELECT membership_product_id FROM memberships WHERE id = ${seedUuid(0, '31')}::uuid) fixture
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:populationGrants */
    INSERT INTO membership_grants (id, membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
    SELECT input.grant_id, membership.membership_source_id, membership.user_id,
      membership.membership_product_id, 30, 'EXPLAIN fixture'
    FROM unnest(${populationGrants}::uuid[], ${populationMemberships}::uuid[]) AS input(grant_id, membership_id)
    JOIN memberships membership ON membership.id = input.membership_id
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:populationHistory */
    INSERT INTO membership_changes (id, membership_id, user_id, membership_source_id, membership_grant_id, change_type)
    SELECT input.change_id, membership.id, membership.user_id, membership.membership_source_id, input.grant_id, 'expiration'
    FROM unnest(${populationChanges}::uuid[], ${populationMemberships}::uuid[], ${populationGrants}::uuid[])
      AS input(change_id, membership_id, grant_id)
    JOIN memberships membership ON membership.id = input.membership_id
    ON CONFLICT DO NOTHING`)
  const userIds = [seedUuid(18_000, '01'), seedUuid(18_001, '01')]
  const membershipIds = [seedUuid(18_000, '31'), seedUuid(18_001, '31')]
  const sourceIds = [seedUuid(18_000, '33'), seedUuid(18_001, '33')]
  const grantIds = [seedUuid(18_000, '3a'), seedUuid(18_001, '3a')]
  const changeIds = Array.from({ length: 4 }, (_, index) => seedUuid(18_000 + index, '3b'))
  const duplicateEvent = 'explain-membership-change-existing-event'
  await write(sql`/* seedExplainMembershipChanges:sources */
    INSERT INTO membership_sources (id, user_id, source_kind)
    SELECT source_id, user_id, 'admin_grant'
    FROM unnest(${sourceIds}::uuid[], ${userIds}::uuid[]) AS input(source_id, user_id)
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:memberships */
    INSERT INTO memberships (id, user_id, membership_source_id, membership_product_id, effective_at)
    SELECT input.membership_id, input.user_id, input.source_id, fixture.membership_product_id, now()
    FROM unnest(${membershipIds}::uuid[], ${userIds}::uuid[], ${sourceIds}::uuid[])
      AS input(membership_id, user_id, source_id)
    CROSS JOIN (SELECT membership_product_id FROM memberships WHERE id = ${seedUuid(0, '31')}::uuid) fixture
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:grants */
    INSERT INTO membership_grants (id, membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
    SELECT input.grant_id, membership.membership_source_id, membership.user_id,
      membership.membership_product_id, 30, 'EXPLAIN fixture'
    FROM unnest(${grantIds}::uuid[], ${membershipIds}::uuid[]) AS input(grant_id, membership_id)
    JOIN memberships membership ON membership.id = input.membership_id
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:history */
    INSERT INTO membership_changes (id, membership_id, user_id, membership_source_id, membership_grant_id, change_type, stripe_event_id)
    SELECT input.change_id, membership.id, membership.user_id, membership.membership_source_id,
      input.grant_id, 'expiration', input.stripe_event_id
    FROM unnest(${changeIds}::uuid[], ${[membershipIds[0], membershipIds[0], membershipIds[1], membershipIds[0]]}::uuid[],
      ${[grantIds[0], grantIds[0], grantIds[1], grantIds[0]]}::uuid[],
      ${[null, null, null, duplicateEvent]}::text[])
      AS input(change_id, membership_id, grant_id, stripe_event_id)
    JOIN memberships membership ON membership.id = input.membership_id
    ON CONFLICT DO NOTHING`)
  await write(sql`/* seedExplainMembershipChanges:latest */
    UPDATE memberships SET latest_change_id = ${changeIds[0]}::uuid
    WHERE id = ${membershipIds[0]}::uuid AND latest_change_id IS NULL`)
  await write(
    '/* seedExplainMembershipChanges:analyze */ ANALYZE memberships, membership_grants, membership_changes',
  )

  const changes = [
    {
      membershipId: membershipIds[0]!,
      userId: userIds[0]!,
      changeType: 'expiration' as const,
      stripeEventId: duplicateEvent,
    },
    {
      membershipId: membershipIds[0]!,
      userId: userIds[0]!,
      membershipSourceId: sourceIds[0],
      membershipGrantId: grantIds[0],
      changeType: 'expiration' as const,
      expiredAt: new Date('2026-01-01T00:00:00Z'),
      stripeEventId: 'explain-membership-change-new-event',
    },
    { membershipId: membershipIds[0]!, userId: userIds[0]!, changeType: 'expiration' as const },
    { membershipId: membershipIds[1]!, userId: userIds[1]!, changeType: 'expiration' as const },
  ]
  registerScenarioContract('membership-change-batch-insert', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_membership_changes__stripe_event',
          'memberships_pkey',
          'idx_membership_grants__source_id',
        ],
      },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 20 },
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: 20 },
      { kind: 'maxProcessedRows', relation: 'membership_changes', max: 8 },
    ],
    seededRows: { memberships: 3_000, membership_grants: 3_000, membership_changes: 3_000 },
  })
  await runAndCapture(
    'membership-change-batch-insert',
    async () => {
      await using transaction = await beginTransaction()
      const result = await transaction(buildMembershipChangesInsert(changes, true))
      if (result.rows.length !== 3)
        throw new Error('Expected one duplicate and three inserted changes')
      await transaction.rollback()
    },
    undefined,
    'recordMembershipChanges',
  )

  registerScenarioContract('membership-change-batch-effects', {
    // PostgreSQL reports zero root rows for INSERT without RETURNING; the callback asserts writes.
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_entitlement_effects__change_id'] },
      { kind: 'maxProcessedRows', relation: 'membership_entitlement_effects', max: 8 },
    ],
  })
  await runAndCapture(
    'membership-change-batch-effects',
    async () => {
      await using transaction = await beginTransaction()
      const result = await transaction(
        buildMembershipEntitlementEffectsInsert([
          { membershipChangeId: changeIds[0]!, userId: userIds[0]! },
          { membershipChangeId: changeIds[1]!, userId: userIds[0]! },
          { membershipChangeId: changeIds[2]!, userId: userIds[1]! },
        ]),
      )
      if (result.rowCount !== 3) throw new Error('Expected three inserted entitlement effects')
      await transaction.rollback()
    },
    undefined,
    'recordMembershipEntitlementEffects',
  )

  registerScenarioContract('membership-change-batch-latest', {
    // PostgreSQL reports zero root rows for UPDATE without RETURNING; the callback asserts writes.
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['memberships_pkey', 'membership_changes_pkey'] },
      { kind: 'maxProcessedRows', relation: 'membership_changes', max: 20 },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 10 },
    ],
    seededRows: { memberships: 3_000, membership_changes: 3_000 },
  })
  await runAndCapture(
    'membership-change-batch-latest',
    async () => {
      await using transaction = await beginTransaction()
      const result = await transaction(
        buildLatestMembershipChangeUpdate(changeIds.slice(0, 3), membershipIds),
      )
      if (result.rowCount !== 2)
        throw new Error('Expected two membership latest changes to advance')
      await transaction.rollback()
    },
    undefined,
    'recordMembershipChanges:updateLatest',
  )
}
