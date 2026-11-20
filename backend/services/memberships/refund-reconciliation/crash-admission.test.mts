import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestStripeRefundRejection } from '@voucha/test-helpers/stripe-refund-rejection'
import { createTestAdministratorRefundRequest as request } from '@voucha/test-helpers/membership-administrator-refund-request'
import * as stripeRefunds from '@modules/stripe/refunds'
import { membershipAdditionalWorkDefaults } from '../work-limits.mts'
import {
  claimAdministratorRefundRequest,
  leaseDueRefundReconciliation,
  reconcileMembershipRefundOperation,
  recordRefundReconciliationAttempt,
} from './index.mts'

describe('administrator refund crash admission', () => {
  afterEach(() => vi.restoreAllMocks())
  it('keeps a crashed administrator execution counted when its actual replay receives a pre-execution rejection', async () => {
    const refundRequest = await request()
    let replayLease: Awaited<ReturnType<typeof leaseDueRefundReconciliation>> = null
    let replayAttempt: Awaited<ReturnType<typeof recordRefundReconciliationAttempt>> | null = null
    for (
      let index = 0;
      index < membershipAdditionalWorkDefaults.local_stripe_refund_issuances_per_charge;
      index++
    ) {
      const operation = await claimAdministratorRefundRequest({
        ...refundRequest,
        idempotencyKey: `crash-cap-${randomUUID()}`,
      })
      const lease = await leaseDueRefundReconciliation(operation.id)
      if (!lease) throw new Error('Expected a durable pending administrator execution')
      const attempt = await recordRefundReconciliationAttempt(
        lease,
        `crash-attempt-${randomUUID()}`,
      )
      replayLease ??= lease
      replayAttempt ??= attempt
    }
    if (!replayLease || !replayAttempt) throw new Error('Expected a crashed administrator attempt')
    const rejection = await createTestStripeRefundRejection()
    const createRefund = vi.spyOn(stripeRefunds, 'createStripeRefund').mockRejectedValue(rejection)
    await reconcileMembershipRefundOperation(replayLease)
    expect(createRefund).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        amountMinorUnits: replayAttempt.amount.amount,
        idempotencyKey: replayAttempt.providerIdempotencyKey,
        metadata: {
          membership_refund_operation_id: replayLease.id,
          membership_refund_attempt_id: replayAttempt.id,
        },
      }),
    )
    await expect(
      claimAdministratorRefundRequest({
        ...refundRequest,
        idempotencyKey: `eleventh-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBERSHIP_REFUND_LIMIT_REACHED',
    })
  })
})
