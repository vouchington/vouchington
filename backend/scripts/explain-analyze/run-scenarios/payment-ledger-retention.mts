import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { cleanupPaymentLedgers } from '@services/data-retention/cleanup-payment-ledgers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** No fiscal year is due yet: both ledger selectors must skip the current corpus by index. */
export async function runPaymentLedgerRetentionScenarios(): Promise<void> {
  const applicationId = `explain-retention-${randomUUID()}`
  await write(
    `/* seedExplainPaymentLedgerOperations */
     WITH lineage AS (
       INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
       VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', $1), $2)
       RETURNING id, membership_provider_context_id
     ), binding AS (
       INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
       SELECT id, $3::uuid FROM lineage RETURNING id, membership_provider_lineage_id
     ), source AS (
       INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
       SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
     )
     INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
       membership_lineage_binding_id, membership_provider_context_id, operation_kind,
       idempotency_key, requested_at, completed_at)
     SELECT source.id, source.membership_provider_lineage_id, binding.id,
       lineage.membership_provider_context_id, 'cancel_source', $4 || n,
       NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
     FROM lineage JOIN source ON source.membership_provider_lineage_id = lineage.id
       JOIN binding ON binding.membership_provider_lineage_id = lineage.id
       CROSS JOIN generate_series(0, 1999) AS n`,
    [applicationId, `lineage-${randomUUID()}`, seedUser.id, `retention-${randomUUID()}-`],
  )
  await write(`/* seedExplainPaymentLedgerOperations:analyze */ ANALYZE membership_operations`)

  const limits = { batchSize: 20, maxBatches: 1 }
  registerScenarioContract('membership-stripe-event-retention-idle', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_stripe_events__occurred_at_id'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'stripe_events', max: 5 },
    ],
    seededRows: { stripe_events: 2000 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-stripe-event-retention-idle',
    () => cleanupPaymentLedgers(limits),
    undefined,
    'selectExpiredStripeEventLedgerPage',
  )

  registerScenarioContract('membership-operation-retention-idle', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_operations__completed_at_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'membership_operations', max: 5 },
    ],
    seededRows: { membership_operations: 2000 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-operation-retention-idle',
    () => cleanupPaymentLedgers(limits),
    undefined,
    'selectExpiredMembershipOperationLedgerPage',
  )
}
