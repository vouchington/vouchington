import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { getLatestMembershipByUserId } from './get.mts'
import {
  listRefundableCharges,
  refundMembership,
  type MembershipStripeOperations,
} from './refund-membership.mts'

const mockInvoicesList = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const mockRefundsCreate = vi.fn<MembershipStripeOperations['createRefund']>()
const mockSubsCancel = vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

function stripeOperations(): MembershipStripeOperations {
  return {
    listSubscriptionInvoices: mockInvoicesList,
    createRefund: mockRefundsCreate,
    cancelSubscriptionImmediately: mockSubsCancel,
  }
}

function fakeInvoice(chargeId: string | null, piId: string | null) {
  return [
    {
      status: 'paid',
      id: 'in_test',
      amountPaid: 1000,
      currency: 'usd',
      created: 1700000000,
      description: null,
      payments: [
        {
          amountPaid: 1000,
          payment: chargeId
            ? { type: 'charge', chargeId, paymentIntentId: null }
            : { type: 'payment_intent', chargeId: null, paymentIntentId: piId },
        },
      ],
    },
  ]
}

describe('membership refunds (Stripe-mocked)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('listRefundableCharges', () => {
    it('returns empty array for user with no membership', async () => {
      const user = await createTestUser()
      expect(await listRefundableCharges(user.id, user.id, stripeOperations())).toEqual([])
    })

    it('parses invoice payments and returns charge info', async () => {
      const user = await createTestUser()
      const subId = `sub_${Math.random().toString(36).slice(2, 10)}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice('ch_abc', null))

      const [charge] = await listRefundableCharges(user.id, user.id, stripeOperations())
      expect(charge!.charge_id).toBe('ch_abc')
      expect(charge!.payment_intent_id).toBeNull()
      expect(charge!.amount).toEqual({ amount: 1000, currency: 'usd' })
      expect(charge!.invoice_id).toBe('in_test')
    })
  })

  describe('refundMembership', () => {
    it('creates a goodwill refund without cancelling subscription', async () => {
      const user = await createTestUser()
      const uniqueId = Math.random().toString(36).slice(2, 10)
      const subId = `sub_${uniqueId}`
      const chargeId = `ch_gw_${uniqueId}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
      mockRefundsCreate.mockResolvedValue({
        id: `re_gw_${uniqueId}`,
        chargeId,
        paymentIntentId: null,
        amount: 1000,
        currency: 'usd',
      })

      const result = await refundMembership(
        user.id,
        {
          targetUserId: user.id,
          chargeId,
          paymentIntentId: null,
          invoiceId: 'in_test',
          reason: 'goodwill',
          cancel: false,
          idempotencyToken: randomUUID(),
        },
        stripeOperations(),
      )

      expect(result.stripe_refund_id).toBe(`re_gw_${uniqueId}`)
      expect(result.revoked_access).toBe(false)
      expect(result.source).toBe('admin')
      expect(mockSubsCancel).not.toHaveBeenCalled()
    })

    it('completes local revocation when a lost worker reply converges on retry', async () => {
      const user = await createTestUser()
      const uniqueId = Math.random().toString(36).slice(2, 10)
      const subId = `sub_cancel_retry_${uniqueId}`
      const chargeId = `ch_cancel_retry_${uniqueId}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
      mockRefundsCreate.mockResolvedValue({
        id: `re_cancel_retry_${uniqueId}`,
        chargeId,
        paymentIntentId: null,
        amount: 1000,
        currency: 'usd',
      })
      mockSubsCancel
        .mockRejectedValueOnce(new Error('worker reply was lost after Stripe canceled'))
        .mockResolvedValueOnce(null)
      const options = {
        targetUserId: user.id,
        chargeId,
        paymentIntentId: null,
        invoiceId: 'in_test',
        reason: 'requested' as const,
        cancel: true,
        idempotencyToken: randomUUID(),
      }

      const initialResult = await refundMembership(user.id, options, stripeOperations())

      expect(initialResult.stripe_refund_id).toBe(`re_cancel_retry_${uniqueId}`)
      expect(initialResult.revoked_access).toBe(false)
      expect(mockRefundsCreate).toHaveBeenCalledOnce()

      const replayResult = await refundMembership(user.id, options, stripeOperations())

      expect(replayResult.revoked_access).toBe(true)
      expect(mockRefundsCreate).toHaveBeenCalledOnce()
      expect(mockSubsCancel).toHaveBeenCalledTimes(2)
      expect(mockSubsCancel.mock.calls[1]![0]).toEqual(mockSubsCancel.mock.calls[0]![0])
      await expect(getLatestMembershipByUserId(user.id)).resolves.toMatchObject({
        status: 'cancelled',
      })
    })

    it('creates refund and cancels subscription when cancel=true', async () => {
      const user = await createTestUser()
      const uniqueId = Math.random().toString(36).slice(2, 10)
      const subId = `sub_${uniqueId}`
      const chargeId = `ch_rv_${uniqueId}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
      mockRefundsCreate.mockResolvedValue({
        id: `re_rv_${uniqueId}`,
        chargeId,
        paymentIntentId: null,
        amount: 1000,
        currency: 'usd',
      })
      mockSubsCancel.mockResolvedValue(null)

      const result = await refundMembership(
        user.id,
        {
          targetUserId: user.id,
          chargeId,
          paymentIntentId: null,
          invoiceId: 'in_test',
          reason: 'requested',
          cancel: true,
          idempotencyToken: randomUUID(),
        },
        stripeOperations(),
      )

      expect(result.revoked_access).toBe(true)
      expect(mockSubsCancel).toHaveBeenCalledWith({
        subscriptionId: subId,
      })
    })

    it('rejects a refund when the supplied payment intent does not match the charge record', async () => {
      const user = await createTestUser()
      const subId = `sub_${Math.random().toString(36).slice(2, 10)}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice('ch_legit', null))

      await expect(
        refundMembership(
          user.id,
          {
            targetUserId: user.id,
            chargeId: 'ch_legit',
            paymentIntentId: 'pi_unrelated',
            invoiceId: 'in_test',
            reason: 'goodwill',
            cancel: false,
            idempotencyToken: randomUUID(),
          },
          stripeOperations(),
        ),
      ).rejects.toThrow('No refundable charge found for membership')

      expect(mockRefundsCreate).not.toHaveBeenCalled()
    })

    it('rejects a refund when the supplied charge does not match the payment intent record', async () => {
      const user = await createTestUser()
      const subId = `sub_${Math.random().toString(36).slice(2, 10)}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice(null, 'pi_legit'))

      await expect(
        refundMembership(
          user.id,
          {
            targetUserId: user.id,
            chargeId: 'ch_unrelated',
            paymentIntentId: 'pi_legit',
            invoiceId: 'in_test',
            reason: 'goodwill',
            cancel: false,
            idempotencyToken: randomUUID(),
          },
          stripeOperations(),
        ),
      ).rejects.toThrow('No refundable charge found for membership')

      expect(mockRefundsCreate).not.toHaveBeenCalled()
    })

    it('rejects a refund when no Stripe identifier is supplied to the service', async () => {
      const user = await createTestUser()
      const subId = `sub_${Math.random().toString(36).slice(2, 10)}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice('ch_no_id', null))

      await expect(
        refundMembership(
          user.id,
          {
            targetUserId: user.id,
            chargeId: null,
            paymentIntentId: null,
            invoiceId: 'in_test',
            reason: 'goodwill',
            cancel: false,
            idempotencyToken: randomUUID(),
          },
          stripeOperations(),
        ),
      ).rejects.toThrow('No refundable charge found for membership')

      expect(mockRefundsCreate).not.toHaveBeenCalled()
    })

    it('handles payment_intent-only charges (Stripe v22 modern path)', async () => {
      const user = await createTestUser()
      const uniqueId = Math.random().toString(36).slice(2, 10)
      const subId = `sub_${uniqueId}`
      const paymentIntentId = `pi_test_${uniqueId}`
      await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
      mockInvoicesList.mockResolvedValue(fakeInvoice(null, paymentIntentId))
      mockRefundsCreate.mockResolvedValue({
        id: `re_pi_${uniqueId}`,
        chargeId: `ch_from_pi_${uniqueId}`,
        paymentIntentId,
        amount: 1000,
        currency: 'usd',
      })

      const result = await refundMembership(
        user.id,
        {
          targetUserId: user.id,
          chargeId: null,
          paymentIntentId,
          invoiceId: 'in_test',
          reason: 'goodwill',
          cancel: false,
          idempotencyToken: randomUUID(),
        },
        stripeOperations(),
      )

      expect(result.stripe_charge_id).toBe(`ch_from_pi_${uniqueId}`)
      expect(result.stripe_payment_intent_id).toBe(paymentIntentId)
      expect(result.revoked_access).toBe(false)
    })
  })
})
