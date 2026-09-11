import { describe, expect, it, vi } from 'vitest'
import {
  createOrRetrieveIneligiblePurchaseReversalRefund,
  getSucceededIneligiblePurchaseReversalRefund,
  type IneligiblePurchaseReversalRefundOperations,
} from './ineligible-stripe-purchase-reversal-provider.mts'

describe('createOrRetrieveIneligiblePurchaseReversalRefund', () => {
  it('returns a settled recorded provider refund without creating another refund', async () => {
    const createRefund = vi.fn<IneligiblePurchaseReversalRefundOperations['createRefund']>()
    const retrieveRefund = vi
      .fn<NonNullable<IneligiblePurchaseReversalRefundOperations['retrieveRefund']>>()
      .mockResolvedValue({
        amount: 1_000,
        currency: 'usd',
        id: 're_settled',
        status: 'succeeded',
      } as never)

    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(
        {
          completed: false,
          executionClaimToken: 'claim-token',
          hasReceipt: false,
          id: 'operation-settled',
          idempotencyKey: 'ineligible-purchase-reversal:operation-settled',
          providerRefundId: 're_settled',
          target: {
            amountMinorUnits: 1_000,
            chargeId: 'ch_settled',
            currency: 'usd',
            invoiceId: 'in_settled',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1_000,
          },
        },
        { createRefund, retrieveRefund },
      ),
    ).resolves.toMatchObject({ id: 're_settled', status: 'succeeded' })

    expect(retrieveRefund).toHaveBeenCalledWith('re_settled')
    expect(createRefund).not.toHaveBeenCalled()
  })

  it('rejects a missing retrieval operation and a pending recorded refund', async () => {
    const reversal = {
      completed: false,
      executionClaimToken: 'claim-token',
      hasReceipt: false,
      id: 'operation-pending',
      idempotencyKey: 'key',
      providerRefundId: 're_pending',
      target: {
        amountMinorUnits: 1,
        chargeId: 'ch_pending',
        currency: 'usd',
        invoiceId: 'in_pending',
        paymentIntentId: null,
        qualifyingAmountMinorUnits: 1,
      },
    }
    await expect(
      getSucceededIneligiblePurchaseReversalRefund(reversal, {
        createRefund: vi.fn<IneligiblePurchaseReversalRefundOperations['createRefund']>(),
      }),
    ).rejects.toThrow('requires a refund retrieval operation')
    await expect(
      getSucceededIneligiblePurchaseReversalRefund(reversal, {
        createRefund: vi.fn<IneligiblePurchaseReversalRefundOperations['createRefund']>(),
        retrieveRefund: vi
          .fn<NonNullable<IneligiblePurchaseReversalRefundOperations['retrieveRefund']>>()
          .mockResolvedValue({
            id: 're_pending',
            amount: 1,
            currency: 'usd',
            status: 'pending',
          } as never),
      }),
    ).rejects.toThrow('refund is pending')
  })
})
