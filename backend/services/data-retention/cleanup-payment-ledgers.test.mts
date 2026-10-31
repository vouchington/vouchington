import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createStripeEvent } from '@voucha/test-helpers/membership-stripe-fixtures'
import { seedStripeEventRetentionWork } from '@voucha/test-helpers/payment-operation-retention'
import {
  createCompletedFiscalCancellation,
  createCompletedFiscalAdministratorRefund,
  removeTerminalStripeWorkForRetention,
  paymentLedgerRecordExists,
} from '@voucha/test-helpers/payment-ledger-retention'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'

const year = new Date().getUTCFullYear()
const expiredAt = new Date(Date.UTC(year - 8, 11, 31, 12))
const withinWindow = new Date(Date.UTC(year - 7, 0, 1, 12))

describe('payment ledger fiscal retention', () => {
  it('deletes only settled records past seven full years after their UTC fiscal year', async () => {
    const oldEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const youngEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const oldEventId = await seedStripeEventRetentionWork(oldEvent, expiredAt, expiredAt)
    const youngEventId = await seedStripeEventRetentionWork(youngEvent, withinWindow, withinWindow)
    await removeTerminalStripeWorkForRetention(oldEventId)
    await removeTerminalStripeWorkForRetention(youngEventId)
    const oldOperationId = await createCompletedFiscalCancellation(expiredAt)
    const youngOperationId = await createCompletedFiscalCancellation(withinWindow)

    const result = await cleanupPaymentLedgers({ batchSize: 4, maxBatches: 1 }, [
      oldEventId,
      youngEventId,
      oldOperationId,
      youngOperationId,
    ])

    expect(result).toEqual([
      { family: 'stripe_event', scanned: 1, deleted: 1, hasMore: false },
      { family: 'membership_operation', scanned: 1, deleted: 1, hasMore: false },
    ])
    await expect(paymentLedgerRecordExists('stripe_event', oldEventId)).resolves.toBe(false)
    await expect(paymentLedgerRecordExists('stripe_event', youngEventId)).resolves.toBe(true)
    await expect(paymentLedgerRecordExists('membership_operation', oldOperationId)).resolves.toBe(
      false,
    )
    await expect(paymentLedgerRecordExists('membership_operation', youngOperationId)).resolves.toBe(
      true,
    )
  })

  it('rejects an oversized scoped page before touching another ledger', async () => {
    await expect(
      cleanupPaymentLedgers({ batchSize: 0, maxBatches: 1 }, [randomUUID()]),
    ).rejects.toThrow('Payment ledger retention requires positive limits')
    await expect(
      cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [randomUUID(), randomUUID()]),
    ).rejects.toThrow('Scoped payment ledger cleanup must fit one page')
  })

  it('drains an expired administrator refund in FK order with one physical row per run', async () => {
    const operationId = await createCompletedFiscalAdministratorRefund(expiredAt)
    for (const finalPage of [false, false, true]) {
      const result = await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [operationId])
      expect(result).toContainEqual({
        family: 'membership_operation',
        scanned: 1,
        deleted: 1,
        hasMore: !finalPage,
      })
      await expect(paymentLedgerRecordExists('membership_operation', operationId)).resolves.toBe(
        !finalPage,
      )
    }
  })
})
