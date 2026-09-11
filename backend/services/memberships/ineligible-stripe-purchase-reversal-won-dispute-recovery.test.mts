import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  getTestIneligiblePurchaseReversalCaseOperationCount,
  getTestWonDisputeRecovery,
  recordTestIneligiblePurchaseReversalReceipt,
} from '@voucha/test-helpers'
import {
  createRecoveryOperations,
  createWonDisputeRecoveryFixture,
} from './test-helpers/won-dispute-recovery-fixtures.mts'
import { getIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-read.mts'
import { claimWonStripeDisputeRecovery } from './ineligible-stripe-purchase-reversal/won-dispute-recovery-ledger.mts'
import { reconcileWonStripeDispute } from './reconcile-won-stripe-dispute.mts'

describe('won Stripe dispute reversal recovery', () => {
  it('refunds the exact amount previously satisfied by a lost dispute once', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const operations = createRecoveryOperations(fixture)

    await expect(reconcile(fixture.disputeId, operations)).resolves.toBe(true)
    expect(operations.createRefund).toHaveBeenCalledOnce()
    expect(operations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinorUnits: fixture.amountMinorUnits,
        paymentIntentId: fixture.paymentIntentIds[0],
      }),
    )
    await expect(
      getTestWonDisputeRecovery(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      operation_kind: 'collision_resolution',
      receipt_amount_minor_units: '1000',
    })
    await expect(
      getTestIneligiblePurchaseReversalCaseOperationCount(fixture.subscriptionId, 'production'),
    ).resolves.toBe(1)
  })

  it('converges a duplicate while the original delivery holds the execution claim', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const operations = createRecoveryOperations(fixture)
    const refundStarted = Promise.withResolvers<void>()
    const releaseRefund = Promise.withResolvers<void>()
    onTestFinished(() => releaseRefund.resolve())
    vi.mocked(operations.createRefund).mockImplementationOnce(async options => {
      refundStarted.resolve()
      await releaseRefund.promise
      return {
        amount: options.amountMinorUnits!,
        currency: 'usd',
        id: `re_won_dispute_${randomUUID()}`,
        status: 'succeeded',
      } as never
    })

    const original = reconcile(fixture.disputeId, operations)
    await refundStarted.promise
    await expect(
      getTestWonDisputeRecovery(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: null, has_execution_claim: true })
    await expect(
      Promise.all([
        reconcile(fixture.disputeId, operations),
        reconcile(fixture.disputeId, operations),
      ]),
    ).resolves.toEqual([true, true])
    expect(operations.createRefund).toHaveBeenCalledOnce()
    await expect(
      getTestWonDisputeRecovery(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: null, has_execution_claim: true })

    releaseRefund.resolve()
    await expect(original).resolves.toBe(true)
    await expect(
      getTestWonDisputeRecovery(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      has_execution_claim: false,
    })
  })

  it('propagates an unexpected recovery claim failure', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const operations = createRecoveryOperations(fixture)
    const error = new Error('claim storage failure')
    const recoveryLedger =
      await import('./ineligible-stripe-purchase-reversal/won-dispute-recovery-ledger.mts')
    vi.spyOn(recoveryLedger, 'claimWonStripeDisputeRecovery').mockRejectedValueOnce(error)

    await expect(reconcile(fixture.disputeId, operations)).rejects.toBe(error)
    expect(operations.createRefund).not.toHaveBeenCalled()
  })

  it('recovers only the lost portion after an earlier partial provider refund', async () => {
    const fixture = await createWonDisputeRecoveryFixture(400)
    const operations = createRecoveryOperations(fixture)

    await expect(reconcile(fixture.disputeId, operations)).resolves.toBe(true)
    expect(operations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinorUnits: 600,
        paymentIntentId: fixture.paymentIntentIds[0],
      }),
    )
  })

  it('keeps recovery caps independent across payment targets in one invoice', async () => {
    const fixture = await createWonDisputeRecoveryFixture(0, [500, 500])
    const firstOperations = createRecoveryOperations(fixture, 0, 0)
    const secondOperations = createRecoveryOperations(fixture, 0, 1)

    await expect(reconcile(`dp_first_${randomUUID()}`, firstOperations)).resolves.toBe(true)
    await expect(reconcile(`dp_second_${randomUUID()}`, secondOperations)).resolves.toBe(true)
    expect(firstOperations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinorUnits: 500,
        paymentIntentId: fixture.paymentIntentIds[0],
      }),
    )
    expect(secondOperations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinorUnits: 500,
        paymentIntentId: fixture.paymentIntentIds[1],
      }),
    )
  })

  it('does not recover an unrelated dispute or one with no refundable remainder', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const unrelated = createRecoveryOperations({
      ...fixture,
      invoiceId: `in_unrelated_${randomUUID()}`,
    })

    await expect(reconcile(fixture.disputeId, unrelated)).resolves.toBe(false)
    expect(unrelated.createRefund).not.toHaveBeenCalled()
    const noRemainder = createRecoveryOperations(fixture, fixture.amountMinorUnits)
    await expect(reconcile(fixture.disputeId, noRemainder)).resolves.toBe(false)
    expect(noRemainder.createRefund).not.toHaveBeenCalled()
  })

  it('rejects stale case context and a payment target absent from the original case', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const reversalCase = await getReversalCase(fixture)
    const target = getTarget(fixture, fixture.paymentIntentIds[0]!)

    await expect(
      claimWonStripeDisputeRecovery(
        { ...reversalCase, id: randomUUID() },
        fixture.disputeId,
        target,
      ),
    ).resolves.toBeNull()
    await expect(
      claimWonStripeDisputeRecovery(
        reversalCase,
        fixture.disputeId,
        getTarget(fixture, `pi_absent_${randomUUID()}`),
      ),
    ).resolves.toBeNull()
  })

  it('terminalizes an existing recovery receipt before replay completes', async () => {
    const fixture = await createWonDisputeRecoveryFixture()
    const reversalCase = await getReversalCase(fixture)
    const target = getTarget(fixture, fixture.paymentIntentIds[0]!)
    const recovery = (await claimWonStripeDisputeRecovery(reversalCase, fixture.disputeId, target))!
    await recordTestIneligiblePurchaseReversalReceipt(
      recovery.id,
      `re_receipt_${randomUUID()}`,
      fixture.amountMinorUnits,
    )

    await expect(
      claimWonStripeDisputeRecovery(reversalCase, fixture.disputeId, target),
    ).resolves.toMatchObject({ completed: true, hasReceipt: true })
    await expect(
      getTestWonDisputeRecovery(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: expect.any(Date) })
  })
})

type Fixture = Awaited<ReturnType<typeof createWonDisputeRecoveryFixture>>
type Operations = ReturnType<typeof createRecoveryOperations>

function reconcile(disputeId: string, operations: Operations) {
  return reconcileWonStripeDispute({
    disputeId,
    providerEnvironment: 'production',
    operations: operations as never,
  })
}

async function getReversalCase(fixture: Fixture) {
  return (await getIneligiblePurchaseReversalCase({
    originatingInvoiceId: fixture.invoiceId,
    providerApplicationId: 'voucha-web',
    providerEnvironment: 'production',
  }))!
}

function getTarget(fixture: Fixture, paymentIntentId: string) {
  return {
    amountMinorUnits: fixture.amountMinorUnits,
    chargeId: null,
    currency: 'usd',
    invoiceId: fixture.invoiceId,
    paymentIntentId,
    qualifyingAmountMinorUnits: fixture.amountMinorUnits,
  }
}
