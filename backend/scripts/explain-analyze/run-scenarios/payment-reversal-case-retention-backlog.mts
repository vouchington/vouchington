import assert from 'node:assert/strict'
import { cleanupPaymentLedgers } from '@services/data-retention/cleanup-payment-ledgers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  positionReversalCaseCursor,
  resetReversalCaseCursor,
} from './payment-ledger-retention-seed.mts'

const CASE_INDEX = 'idx_member_inelig_purchase_reversal_cases__collision_at_id'

/**
 * Runs after the operation scenarios: 2000 old cases whose verification cycle is still open sit
 * ahead of one expired case (its operation is gone). A run must read one page, and a later run
 * resumes behind the blocked cases and deletes the expired case with its history.
 */
export async function runPaymentReversalCaseRetentionScenarios(
  blockedPrefix: string,
): Promise<void> {
  await resetReversalCaseCursor()
  registerScenarioContract('membership-reversal-case-retention-blocked-backlog', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [CASE_INDEX],
        queryContains: 'selectExpiredMembershipReversalCasePage',
        noSort: true,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'membership_ineligible_purchase_reversal_cases',
        max: 25,
      },
      { kind: 'maxFunctionCalls', function: 'fn_membership_reversal_case_expired', max: 21 },
    ],
    seededRows: { membership_ineligible_purchase_reversal_cases: 2001 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-reversal-case-retention-blocked-backlog',
    async () => {
      const result = await cleanupPaymentLedgers({ batchSize: 20, maxBatches: 1 })
      assert.deepEqual(
        result.find(page => page.family === 'membership_reversal_case'),
        { family: 'membership_reversal_case', scanned: 20, deleted: 0, hasMore: true },
      )
    },
    undefined,
    'selectExpiredMembershipReversalCasePage',
  )

  await positionReversalCaseCursor(blockedPrefix)
  registerScenarioContract('membership-reversal-case-retention-resumed-after-blocked', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [CASE_INDEX],
        queryContains: 'selectExpiredMembershipReversalCasePage',
        noSort: true,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'membership_ineligible_purchase_reversal_cases',
        max: 25,
      },
    ],
    seededRows: { membership_ineligible_purchase_reversal_cases: 2001 },
    allowEmptyResult: true,
  })
  await runAndCapture(
    'membership-reversal-case-retention-resumed-after-blocked',
    async () => {
      const result = await cleanupPaymentLedgers({ batchSize: 20, maxBatches: 3 })
      assert.equal(result.find(page => page.family === 'membership_reversal_case')?.deleted, 2)
    },
    undefined,
    [
      'selectExpiredMembershipReversalCasePage',
      'deleteExpiredMembershipReversalRefundObservations',
      'deleteExpiredMembershipReversalRefundScans',
      'deleteExpiredMembershipReversalRefundScanCycle',
      'deleteExpiredMembershipReversalCase',
    ],
    { localSettings: { 'app.billing_retention_delete': 'on' } },
  )
}
