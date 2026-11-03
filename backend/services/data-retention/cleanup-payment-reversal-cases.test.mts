import { describe, expect, it } from 'vitest'
import {
  countReversalCaseRetentionRows,
  createReversalCaseForRetention,
  positionReversalCaseLedgerCursor,
} from '@voucha/test-helpers/payment-reversal-case-retention'
import { getIneligiblePurchaseReversalCase } from '../memberships/ineligible-stripe-purchase-reversal/case-read.mts'
import { claimPersistedIneligiblePurchaseReversalCase } from '../memberships/ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'

const year = new Date().getUTCFullYear()
const expiredAt = new Date(Date.UTC(year - 8, 11, 31, 12))
const withinWindow = new Date(Date.UTC(year - 7, 0, 1, 12))
const limits = { batchSize: 10, maxBatches: 1 }
const gone = { cases: 0, cycles: 0, scans: 0, observations: 0 }
const intact = { cases: 1, cycles: 1, scans: 1, observations: 1 }

describe('payment ledger fiscal retention of reversal cases', () => {
  it('deletes an expired closed case with its history', async () => {
    const { caseId } = await createReversalCaseForRetention(expiredAt)

    const result = await cleanupPaymentLedgers(limits, [caseId])

    expect(result).toContainEqual({
      family: 'membership_reversal_case',
      scanned: 1,
      deleted: 4,
      hasMore: false,
    })
    await expect(countReversalCaseRetentionRows(caseId)).resolves.toEqual(gone)
  })

  it.each([
    ['open_cycle', expiredAt, 1],
    ['linked_operation', expiredAt, 1],
    ['closed', withinWindow, 0],
  ] as const)('keeps a %s case collided at %s', async (state, collisionAt, scanned) => {
    const { caseId } = await createReversalCaseForRetention(collisionAt, state)

    const result = await cleanupPaymentLedgers(limits, [caseId])

    expect(result).toContainEqual({
      family: 'membership_reversal_case',
      scanned,
      deleted: 0,
      hasMore: false,
    })
    await expect(countReversalCaseRetentionRows(caseId)).resolves.toEqual(intact)
  })

  it('drains a case over several bounded pages', async () => {
    const { caseId } = await createReversalCaseForRetention(expiredAt)

    const first = await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, [caseId])
    expect(first).toContainEqual({
      family: 'membership_reversal_case',
      scanned: 1,
      deleted: 2,
      hasMore: true,
    })
    await expect(countReversalCaseRetentionRows(caseId)).resolves.toMatchObject({ cases: 1 })

    await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, [caseId])
    await expect(countReversalCaseRetentionRows(caseId)).resolves.toEqual(gone)
  })

  it('steps a persisted cursor past a blocked case to reach an expired one behind it', async () => {
    const blocked = await createReversalCaseForRetention(
      new Date(Date.UTC(1990, 0, 1)),
      'open_cycle',
    )
    const due = await createReversalCaseForRetention(new Date(Date.UTC(1990, 0, 2)))
    await positionReversalCaseLedgerCursor(blocked.caseId)

    await cleanupPaymentLedgers({ batchSize: 10, maxBatches: 2 })

    await expect(countReversalCaseRetentionRows(due.caseId)).resolves.toEqual(gone)
    await expect(countReversalCaseRetentionRows(blocked.caseId)).resolves.toEqual(intact)
  })

  it('treats an expired case as absent so a late provider event cannot refund against it', async () => {
    const expired = await createReversalCaseForRetention(expiredAt)
    const live = await createReversalCaseForRetention(withinWindow)
    const lookup = (fixture: typeof expired) => ({
      originatingInvoiceId: fixture.originatingInvoiceId,
      providerApplicationId: fixture.providerApplicationId,
      providerEnvironment: 'test' as const,
    })

    await expect(getIneligiblePurchaseReversalCase(lookup(expired))).resolves.toBeNull()
    await expect(
      claimPersistedIneligiblePurchaseReversalCase(
        { ...lookup(expired), subscriptionId: 'unused' },
        [],
      ),
    ).resolves.toBeNull()
    await expect(getIneligiblePurchaseReversalCase(lookup(live))).resolves.toMatchObject({
      id: live.caseId,
    })
  })
})
