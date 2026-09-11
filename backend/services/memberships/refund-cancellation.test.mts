import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipEntitlementEffects,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from './create.mts'
import { getMembershipByUserId, getMembershipHistory } from './get.mts'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'

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

describe('refund cancellation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('resumes a paused grant in the refund cancellation transaction', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, user.id, 'plus', grantSku.id, 30)
    const directSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_refund_resume_${uniqueId}`
    const chargeId = `ch_refund_resume_${uniqueId}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: directSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
    })
    mockInvoicesList.mockResolvedValue([
      {
        status: 'paid',
        id: 'in_test',
        amountPaid: 1000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1000,
            payment: { type: 'charge', chargeId, paymentIntentId: null },
          },
        ],
      },
    ])
    mockRefundsCreate.mockResolvedValue({
      id: `re_refund_resume_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })
    mockSubsCancel.mockResolvedValue(null)

    await expect(
      refundMembership(
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
      ),
    ).resolves.toMatchObject({ revoked_access: true })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    const history = await getMembershipHistory(user.id)
    const refund = history.find(change => change.change_type === 'refund')
    const resumedGrant = history.find(
      change => change.change_type === 'admin_grant' && change.membership_id !== grant.id,
    )
    if (!refund || !resumedGrant) throw new Error('Expected refund and resumed-grant changes')
    await expect(
      Promise.all(
        [refund, resumedGrant].map(change => getTestMembershipEntitlementEffects(change.id)),
      ),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: refund.id, user_id: user.id })],
      [expect.objectContaining({ membership_change_id: resumedGrant.id, user_id: user.id })],
    ])
  })
})
