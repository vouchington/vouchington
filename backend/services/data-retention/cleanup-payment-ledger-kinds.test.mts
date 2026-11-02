import { describe, expect, it } from 'vitest'
import { paymentLedgerRecordExists } from '@voucha/test-helpers/payment-ledger-retention'
import {
  countFiscalLedgerChildren,
  createCompletedFiscalLedgerOperation,
  positionMembershipOperationLedgerCursor,
  type FiscalLedgerKind,
} from '@voucha/test-helpers/payment-ledger-kinds-retention'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'

const year = new Date().getUTCFullYear()
const expiredAt = new Date(Date.UTC(year - 8, 11, 31, 12))
const withinWindow = new Date(Date.UTC(year - 7, 0, 1, 12))
const limits = { batchSize: 4, maxBatches: 1 }
const physicalRows = {
  automatic_refund: 2,
  collision_resolution: 2,
  ineligible_purchase_reversal: 3,
} as const

describe('payment ledger fiscal retention of every operation kind', () => {
  it.each(Object.entries(physicalRows) as [FiscalLedgerKind, number][])(
    'deletes an expired %s with its receipt and case link',
    async (kind, expectedDeleted) => {
      const { operationId } = await createCompletedFiscalLedgerOperation(kind, expiredAt)

      const result = await cleanupPaymentLedgers(limits, [operationId])

      expect(result).toContainEqual({
        family: 'membership_operation',
        scanned: 1,
        deleted: expectedDeleted,
        hasMore: false,
      })
      await expect(paymentLedgerRecordExists('membership_operation', operationId)).resolves.toBe(
        false,
      )
      await expect(countFiscalLedgerChildren(operationId)).resolves.toEqual({
        receipts: 0,
        caseLinks: 0,
      })
    },
  )

  it.each([
    ['ineligible_purchase_reversal', 'open_cycle'],
    ['ineligible_purchase_reversal', 'unfinished_sibling'],
    ['collision_resolution', 'open_cycle'],
    ['collision_resolution', 'unfinished_sibling'],
  ] as const)('keeps an expired %s while its case has %s', async (kind, caseState) => {
    const { operationId } = await createCompletedFiscalLedgerOperation(kind, expiredAt, caseState)

    const result = await cleanupPaymentLedgers(limits, [operationId])

    expect(result).toContainEqual({
      family: 'membership_operation',
      scanned: 1,
      deleted: 0,
      hasMore: false,
    })
    await expect(paymentLedgerRecordExists('membership_operation', operationId)).resolves.toBe(true)
    await expect(countFiscalLedgerChildren(operationId)).resolves.toMatchObject({ receipts: 1 })
  })

  it.each(Object.keys(physicalRows) as FiscalLedgerKind[])(
    'keeps a %s inside its fiscal window with its children',
    async kind => {
      const { operationId } = await createCompletedFiscalLedgerOperation(kind, withinWindow)

      const result = await cleanupPaymentLedgers(limits, [operationId])

      expect(result).toContainEqual({
        family: 'membership_operation',
        scanned: 0,
        deleted: 0,
        hasMore: false,
      })
      await expect(paymentLedgerRecordExists('membership_operation', operationId)).resolves.toBe(
        true,
      )
      await expect(countFiscalLedgerChildren(operationId)).resolves.toMatchObject({ receipts: 1 })
    },
  )

  it('deletes a due operation that sits behind a blocked one on the same page', async () => {
    const blocked = await createCompletedFiscalLedgerOperation(
      'collision_resolution',
      new Date(Date.UTC(1990, 0, 1)),
      'open_cycle',
    )
    const due = await createCompletedFiscalLedgerOperation(
      'automatic_refund',
      new Date(Date.UTC(1990, 0, 2)),
    )

    const result = await cleanupPaymentLedgers(limits, [blocked.operationId, due.operationId])

    expect(result).toContainEqual({
      family: 'membership_operation',
      scanned: 2,
      deleted: 2,
      hasMore: false,
    })
    await expect(
      paymentLedgerRecordExists('membership_operation', blocked.operationId),
    ).resolves.toBe(true)
    await expect(paymentLedgerRecordExists('membership_operation', due.operationId)).resolves.toBe(
      false,
    )
  })

  it('steps a persisted cursor past a blocked operation to reach a due one behind it', async () => {
    const blocked = await createCompletedFiscalLedgerOperation(
      'ineligible_purchase_reversal',
      new Date(Date.UTC(1990, 0, 3)),
      'open_cycle',
    )
    const due = await createCompletedFiscalLedgerOperation(
      'ineligible_purchase_reversal',
      new Date(Date.UTC(1990, 0, 4)),
    )
    await positionMembershipOperationLedgerCursor(blocked.operationId)

    await cleanupPaymentLedgers({ batchSize: 4, maxBatches: 2 })

    await expect(paymentLedgerRecordExists('membership_operation', due.operationId)).resolves.toBe(
      false,
    )
    await expect(
      paymentLedgerRecordExists('membership_operation', blocked.operationId),
    ).resolves.toBe(true)
  })
})
