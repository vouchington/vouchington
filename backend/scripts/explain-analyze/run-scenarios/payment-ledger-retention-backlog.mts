import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { cleanupPaymentLedgers } from '@services/data-retention/cleanup-payment-ledgers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const limits = { batchSize: 20, maxBatches: 1 }

/** Many old rows this job can never delete sit ahead of one due row; a run must still read one page. */
export async function runPaymentLedgerRetentionBacklogScenarios(): Promise<void> {
  await seedBlockedStripeEvents()
  registerScenarioContract('membership-stripe-event-retention-blocked-backlog', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'stripe_events', max: 25 }],
    seededRows: { stripe_events: 2001 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-stripe-event-retention-blocked-backlog',
    async () => {
      const [stripe] = await cleanupPaymentLedgers(limits)
      assert.deepEqual(stripe, { family: 'stripe_event', scanned: 20, deleted: 0, hasMore: true })
    },
    undefined,
    'selectExpiredStripeEventLedgerPage',
  )

  await seedBlockedMembershipOperations()
  registerScenarioContract('membership-operation-retention-blocked-backlog', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_operations__completed_at_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'membership_operations', max: 5 },
    ],
    seededRows: { membership_operations: 2001 },
  })
  await runAndCapture(
    'membership-operation-retention-blocked-backlog',
    async () => {
      const result = await cleanupPaymentLedgers(limits)
      assert.equal(result.find(page => page.family === 'membership_operation')?.deleted, 1)
    },
    undefined,
    'selectExpiredMembershipOperationLedgerPage',
  )
}

/** Failed work keeps 2000 old events undeletable; the due event has a later id and no work. */
async function seedBlockedStripeEvents(): Promise<void> {
  await write(
    `/* seedExplainBlockedStripeEvents */
     WITH registered_type AS (
       INSERT INTO stripe_event_types (stripe_event_type) VALUES ('explain.retention')
       ON CONFLICT (stripe_event_type) DO UPDATE SET stripe_event_type = EXCLUDED.stripe_event_type
       RETURNING id
     ), blocked AS (
       INSERT INTO stripe_events (id, stripe_event_id, stripe_event_type_id, occurred_at, payload)
       SELECT uuidv7(INTERVAL '-9 years'), $1 || n, registered_type.id, NOW() - INTERVAL '9 years', '{}'::jsonb
       FROM registered_type CROSS JOIN generate_series(0, 1999) AS n RETURNING id
     ), work AS (
       INSERT INTO stripe_event_processing_work_items (stripe_event_id, failed_at)
       SELECT id, NOW() FROM blocked
     ) INSERT INTO stripe_events (id, stripe_event_id, stripe_event_type_id, occurred_at, payload)
       SELECT uuidv7(INTERVAL '-9 years' + INTERVAL '1 day'), $1 || 'due', registered_type.id,
         NOW() - INTERVAL '9 years', '{}'::jsonb FROM registered_type`,
    [`explain-retention-${randomUUID()}-`],
  )
  await write(`/* seedExplainBlockedStripeEvents:analyze */ ANALYZE stripe_events`)
}

/** Automatic refunds are outside this job's kinds; one cancellation completed later is due. */
async function seedBlockedMembershipOperations(): Promise<void> {
  const applicationId = `explain-retention-blocked-${randomUUID()}`
  await write(
    `/* seedExplainBlockedMembershipOperations */
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
     ), blocked AS (
       INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
         membership_lineage_binding_id, membership_provider_context_id, operation_kind,
         idempotency_key, qualifying_allocation_minor_units, remaining_refundable_minor_units,
         currency_code, period_started_at, period_ends_at, requested_at, completed_at)
       SELECT source.id, source.membership_provider_lineage_id, binding.id,
         lineage.membership_provider_context_id, 'automatic_refund', $4 || n, 100, 100, 'usd',
         NOW() - INTERVAL '10 years', NOW() - INTERVAL '9 years 11 months',
         NOW() - INTERVAL '9 years 1 day', NOW() - INTERVAL '9 years'
       FROM lineage JOIN source ON source.membership_provider_lineage_id = lineage.id
         JOIN binding ON binding.membership_provider_lineage_id = lineage.id
         CROSS JOIN generate_series(0, 1999) AS n
     ) INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
         membership_lineage_binding_id, membership_provider_context_id, operation_kind,
         idempotency_key, requested_at, completed_at)
       SELECT source.id, source.membership_provider_lineage_id, binding.id,
         lineage.membership_provider_context_id, 'cancel_source', $4 || 'due',
         NOW() - INTERVAL '8 years 1 day', NOW() - INTERVAL '8 years'
       FROM lineage JOIN source ON source.membership_provider_lineage_id = lineage.id
         JOIN binding ON binding.membership_provider_lineage_id = lineage.id`,
    [applicationId, `lineage-${randomUUID()}`, seedUser.id, `retention-${randomUUID()}-`],
  )
  await write(`/* seedExplainBlockedMembershipOperations:analyze */ ANALYZE membership_operations`)
}
