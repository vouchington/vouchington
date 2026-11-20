import { createTestStripeRefundRejection } from '@voucha/test-helpers/stripe-refund-rejection'
import { recordRefundRequestRejection } from './refund-request-rejection.mts'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeDisputes from '@modules/stripe/disputes'
import { beginTransaction, createTestSku } from '@voucha/test-helpers'
import { createTestAdministratorRefundRequest } from '@voucha/test-helpers/membership-administrator-refund-request'
import { getMembershipRefundEventFixtureForTest } from '@voucha/test-helpers/entities/membership-refund-reconciliation-state'
import { claimTestIneligiblePurchaseReversalOperations } from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { getLockedAdministratorRefundOperation } from './refund-reconciliation/administrator-request-operation.mts'
import { claimAdministratorRefundRequest } from './refund-reconciliation/administrator-request.mts'
import { recordMembershipRefundEvent } from './refunds/index.mts'
import {
  getLatestRefundReconciliationAttempt,
  leaseDueRefundReconciliation,
} from './refund-reconciliation/ledger.mts'
import { createOrRetrieveIneligiblePurchaseReversalRefund } from './ineligible-stripe-purchase-reversal-provider.mts'
import { recordRefundReconciliationAttempt } from './refund-issuance.mts'
import { membershipAdditionalWorkDefaults } from './work-limits.mts'

describe('local Stripe refund issuance capacity', () => {
  afterEach(() => vi.restoreAllMocks())
  it('shares pending attempts across admin and automatic refunds, preserves replay and rejects the eleventh before Stripe', async () => {
    const rejectedRequest = await createTestStripeRefundRejection()
    const applicationId = `refund-cap-${randomUUID()}`
    const request = await createTestAdministratorRefundRequest({
      providerApplicationId: applicationId,
    })
    let firstRequest
    let firstLease
    let metadataAttempt
    let metadataLease
    let firstAttempt
    for (
      let index = 0;
      index < membershipAdditionalWorkDefaults.local_stripe_refund_issuances_per_charge - 1;
      index++
    ) {
      const scopedRequest = { ...request, idempotencyKey: `refund-cap-${randomUUID()}` }
      const operation = await claimAdministratorRefundRequest(scopedRequest)
      firstRequest ??= scopedRequest
      const lease = await leaseDueRefundReconciliation(operation.id)
      if (!lease) throw new Error('Expected a pending refund operation')
      const attempt = await recordRefundReconciliationAttempt(
        lease,
        `refund-attempt-${randomUUID()}`,
      )
      firstLease ??= lease
      firstAttempt ??= attempt
      if (index === 1) {
        metadataAttempt = attempt
        metadataLease = lease
      }
    }
    const fixture = await getMembershipRefundEventFixtureForTest(request.membershipId)
    const sku = await createTestSku({
      plan: 'pro',
      provider_environment: 'test',
      provider_application_id: applicationId,
    })
    const invoiceId = `in-cap-${randomUUID()}`
    const paymentIntentId = `pi_cap_${randomUUID()}`
    const resolveCharge = vi
      .spyOn(stripeDisputes, 'getStripePaymentIntentLatestCharge')
      .mockResolvedValue(request.providerPaymentReference)
    const target = {
      amountMinorUnits: 700,
      chargeId: null,
      currency: 'usd',
      invoiceId,
      paymentIntentId,
      qualifyingAmountMinorUnits: 700,
    }
    const claim = await claimTestIneligiblePurchaseReversalOperations(
      {
        originatingInvoiceId: invoiceId,
        providerApplicationId: applicationId,
        providerEnvironment: 'test',
        stripePriceId: sku.stripe_price_id,
        subscriptionId: `sub-cap-${randomUUID()}`,
        userId: fixture.userId,
      },
      [target],
      { currency: 'usd', qualifyingAmountMinorUnits: 700 },
    )
    const reversal = claim.reversals[0]!
    const operations = {
      createRefund: vi
        .fn<
          Parameters<typeof createOrRetrieveIneligiblePurchaseReversalRefund>[1]['createRefund']
        >()
        .mockRejectedValueOnce(rejectedRequest)
        .mockResolvedValue({
          amount: 700,
          currency: 'usd',
          id: `re-cap-${randomUUID()}`,
          status: 'pending',
        } as never),
      retrieveRefund: vi
        .fn<
          NonNullable<
            Parameters<typeof createOrRetrieveIneligiblePurchaseReversalRefund>[1]['retrieveRefund']
          >
        >()
        .mockResolvedValue({
          amount: 700,
          currency: 'usd',
          id: `re-failed-${randomUUID()}`,
          status: 'failed',
        } as never),
    }
    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(reversal, operations),
    ).rejects.toBe(rejectedRequest)
    const replacementOperation = await claimAdministratorRefundRequest({
      ...request,
      idempotencyKey: `replacement-${randomUUID()}`,
    })
    const replacementLease = await leaseDueRefundReconciliation(replacementOperation.id)
    if (!replacementLease) throw new Error('Expected the replacement refund admission')
    const replacementAttempt = await recordRefundReconciliationAttempt(
      replacementLease,
      `replacement-attempt-${randomUUID()}`,
    )
    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(reversal, operations),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_REFUND_LIMIT_REACHED' })
    expect(operations.createRefund).toHaveBeenCalledOnce()
    await recordRefundRequestRejection(replacementAttempt.id, rejectedRequest)
    const refund = await createOrRetrieveIneligiblePurchaseReversalRefund(reversal, operations)
    expect(operations.createRefund.mock.calls[1]).toEqual(operations.createRefund.mock.calls[0])
    await expect(
      recordRefundReconciliationAttempt(firstLease!, firstAttempt!.providerIdempotencyKey),
    ).resolves.toEqual(firstAttempt)
    {
      await using query = await beginTransaction()
      await expect(
        getLockedAdministratorRefundOperation(
          firstRequest!.idempotencyKey,
          firstRequest!.membershipId,
          query,
        ),
      ).resolves.toMatchObject({
        id: firstLease!.id,
        refundLimitReached: false,
      })
    }
    const replays = await Promise.all([
      claimAdministratorRefundRequest(firstRequest!),
      claimAdministratorRefundRequest(firstRequest!),
    ])
    expect(replays.map(replay => replay.id)).toEqual([firstLease!.id, firstLease!.id])
    await expect(
      claimAdministratorRefundRequest({ ...firstRequest!, note: 'Changed replay body' }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await recordRefundRequestRejection(firstAttempt!.id, rejectedRequest)
    await expect(
      claimAdministratorRefundRequest({ ...request, idempotencyKey: `eleventh-${randomUUID()}` }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBERSHIP_REFUND_LIMIT_REACHED',
    })
    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(
        { ...reversal, providerRefundId: refund.id },
        operations,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBERSHIP_REFUND_LIMIT_REACHED',
    })
    expect(operations.createRefund).toHaveBeenCalledTimes(2)
    expect(operations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId }),
    )
    expect(resolveCharge).toHaveBeenCalledWith(paymentIntentId)
    await recordRefundRequestRejection(metadataAttempt!.id, rejectedRequest)
    const replay = await recordRefundReconciliationAttempt(
      metadataLease!,
      metadataAttempt!.providerIdempotencyKey,
    )
    expect(replay.id).not.toBe(metadataAttempt!.id)
    expect(replay).toMatchObject({
      amount: metadataAttempt!.amount,
      providerIdempotencyKey: metadataAttempt!.providerIdempotencyKey,
      providerRequestOriginalAttemptId: metadataAttempt!.id,
      rejectedAt: null,
    })
    const replayRefundId = `re-replay-${randomUUID()}`
    await expect(
      recordMembershipRefundEvent({
        amount: request.amount,
        membershipId: request.membershipId,
        membershipSourceId: fixture.membershipSourceId,
        providerApplicationId: applicationId,
        providerEnvironment: 'test',
        stripeChargeId: request.providerPaymentReference,
        stripeEventId: `evt-replay-${randomUUID()}`,
        stripePaymentIntentId: null,
        stripeRefundId: replayRefundId,
        stripeRefundMetadata: {
          membership_refund_attempt_id: metadataAttempt!.id,
          membership_refund_operation_id: metadataLease!.id,
        },
        userId: fixture.userId,
      }),
    ).resolves.toEqual({ operationIds: [metadataLease!.id] })
    await expect(getLatestRefundReconciliationAttempt(metadataLease!.id)).resolves.toMatchObject({
      id: replay.id,
      providerRefundId: replayRefundId,
    })
  })
})
