import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { cleanupPaymentLedgers } from '@services/data-retention/cleanup-payment-ledgers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { runPaymentReversalCaseRetentionScenarios } from './payment-reversal-case-retention-backlog.mts'
import {
  positionLedgerCursor,
  resetLedgerCursor,
  seedLedgerOperations,
} from './payment-ledger-retention-seed.mts'

const limits = { batchSize: 20, maxBatches: 1 }
const blockedPrefix = `explain-retention-blocked-${randomUUID()}`
const dueAutomaticPrefix = `explain-retention-due-auto-${randomUUID()}`
const dueReversalPrefix = `explain-retention-due-reversal-${randomUUID()}`

/** Many old rows that cannot be deleted yet sit ahead of due rows; a run must still read one page. */
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
        queryContains: 'selectExpiredMembershipOperationLedgerPage',
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'membership_operations', max: 25 },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_membership_operation_fiscal_retention_due',
        max: 21,
      },
    ],
    seededRows: { membership_operations: 2002 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-operation-retention-blocked-backlog',
    async () => {
      const result = await cleanupPaymentLedgers(limits)
      assert.deepEqual(
        result.find(page => page.family === 'membership_operation'),
        {
          family: 'membership_operation',
          scanned: 20,
          deleted: 0,
          hasMore: true,
        },
      )
    },
    undefined,
    'selectExpiredMembershipOperationLedgerPage',
  )

  // The pass resumes after the blocked rows, as later daily runs do, and drains the due kinds.
  await positionLedgerCursor(blockedPrefix)
  registerScenarioContract('membership-operation-retention-resumed-after-blocked', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_operations__completed_at_id'],
        queryContains: 'selectExpiredMembershipOperationLedgerPage',
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'membership_operations', max: 25 },
    ],
    seededRows: { membership_operations: 2002 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-operation-retention-resumed-after-blocked',
    async () => {
      const result = await cleanupPaymentLedgers({ batchSize: 20, maxBatches: 3 })
      assert.ok((result.find(page => page.family === 'membership_operation')?.deleted ?? 0) >= 5)
    },
    undefined,
    [
      'selectExpiredMembershipOperationLedgerPage',
      'deleteExpiredMembershipAutomaticRefundReceipts',
      'deleteExpiredMembershipReversalCaseLinks',
    ],
    { localSettings: { 'app.billing_retention_delete': 'on' } },
  )
  await runPaymentReversalCaseRetentionScenarios(blockedPrefix)
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

/**
 * 2000 collision operations whose reversal case is still verifying sit ahead of two due operations,
 * one automatic refund and one reversal, each with a receipt (and the reversal a case link).
 */
async function seedBlockedMembershipOperations(): Promise<void> {
  await seedLedgerOperations({
    kind: 'collision_resolution',
    count: 2000,
    completedAgo: '9 years',
    prefix: blockedPrefix,
    caseCycle: 'open',
  })
  await seedLedgerOperations({
    kind: 'automatic_refund',
    count: 1,
    completedAgo: '8 years',
    prefix: dueAutomaticPrefix,
    withChildren: true,
  })
  await seedLedgerOperations({
    kind: 'ineligible_purchase_reversal',
    count: 1,
    completedAgo: '8 years',
    prefix: dueReversalPrefix,
    caseCycle: 'completed',
    withChildren: true,
  })
  await resetLedgerCursor()
}
