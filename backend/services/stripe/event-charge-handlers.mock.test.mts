import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createTestSku, createTestUser, createTestMembership } from '@voucha/test-helpers'
import { getMembershipRefunds } from '@services/memberships'
import type { PrivateUser } from '@services/users/types'

vi.mock<typeof import('@modules/stripe')>(import('@modules/stripe'), async importOriginal => ({
  ...(await importOriginal()),
  getStripeInvoice: vi.fn<VitestLooseMock>(),
  listStripeRefundsForCharge: vi.fn<VitestLooseMock>(),
}))

import { getStripeInvoice, listStripeRefundsForCharge } from '@modules/stripe'
import { handleChargeRefunded } from './event-charge-handlers.mts'

const mockGetStripeInvoice = vi.mocked(getStripeInvoice)
const mockListStripeRefundsForCharge = vi.mocked(listStripeRefundsForCharge)
const applicationContext = { applicationId: `stripe-charge-refund-${randomUUID()}` }

async function handleTestChargeRefund(eventId: string, eventData: Record<string, unknown>) {
  return handleChargeRefunded(eventId, eventData, 'test', applicationContext)
}

describe('handleChargeRefunded', () => {
  let user: PrivateUser
  let subId: string

  beforeAll(async () => {
    user = await createTestUser()
    subId = `sub_wch_${Math.random().toString(36).slice(2, 10)}`
    const sku = await createTestSku({
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'test',
    })
    await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      stripe_subscription_id: subId,
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'test',
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStripeInvoice.mockResolvedValue({
      parent: { subscription_details: { subscription: subId } },
    } as never)
  })

  it('returns early when no invoice on charge', async () => {
    await handleTestChargeRefund('evt_1', { id: 'ch_1' })

    expect(mockGetStripeInvoice).not.toHaveBeenCalled()
  })

  it('returns early when no subscription on invoice', async () => {
    mockGetStripeInvoice.mockResolvedValue({ parent: null } as never)

    await handleTestChargeRefund('evt_1', { id: 'ch_1', invoice: 'in_1', created: 1_700_000_000 })

    expect(mockListStripeRefundsForCharge).not.toHaveBeenCalled()
  })

  it('returns early when no membership found for subscription', async () => {
    mockGetStripeInvoice.mockResolvedValue({
      parent: { subscription_details: { subscription: 'sub_nonexistent_xyz' } },
    } as never)

    const beforeRefunds = await getMembershipRefunds(user.id)
    await handleTestChargeRefund('evt_1', { id: 'ch_1', invoice: 'in_1', created: 1_700_000_000 })
    const afterRefunds = await getMembershipRefunds(user.id)

    expect(afterRefunds.length).toBe(beforeRefunds.length)
  })

  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    'returns early when the charge creation time is invalid: %s',
    async created => {
      await handleTestChargeRefund('evt_1', { id: 'ch_1', invoice: 'in_1', created })

      expect(mockGetStripeInvoice).not.toHaveBeenCalled()
      expect(mockListStripeRefundsForCharge).not.toHaveBeenCalled()
    },
  )

  it('records single refund from embedded list', async () => {
    const chargeId = `ch_wch_${Math.random().toString(36).slice(2, 10)}`
    const refundId = `re_wch_${Math.random().toString(36).slice(2, 10)}`
    const eventData = {
      id: chargeId,
      invoice: 'in_1',
      created: 1_700_000_000,
      payment_intent: 'pi_wch_1',
      refunds: {
        data: [{ id: refundId, amount: 1000, currency: 'usd', payment_intent: 'pi_wch_1' }],
        has_more: false,
      },
    }

    await handleTestChargeRefund('evt_rec_1', eventData)

    const refunds = await getMembershipRefunds(user.id)
    const recorded = refunds.find(r => r.stripe_refund_id === refundId)
    expect(recorded).toBeDefined()
    expect(recorded!.amount).toEqual({ amount: 1000, currency: 'usd' })
    expect(recorded!.stripe_charge_id).toBe(chargeId)
    expect(recorded!.source).toBe('stripe_dashboard')
    expect(recorded!.revoked_access).toBe(false)
    expect(mockListStripeRefundsForCharge).not.toHaveBeenCalled()
  })

  it('records an unsupported Stripe currency once across event retries', async () => {
    const refundId = `re_wch_unsupported_${Math.random().toString(36).slice(2, 10)}`
    const eventData = {
      id: `ch_wch_unsupported_${Math.random().toString(36).slice(2, 10)}`,
      invoice: 'in_1',
      created: 1_700_000_000,
      refunds: {
        data: [{ id: refundId, amount: 1000, currency: 'brl' }],
        has_more: false,
      },
    }

    await handleTestChargeRefund('evt_unsupported_currency_1', eventData)
    await handleTestChargeRefund('evt_unsupported_currency_2', eventData)

    const refunds = await getMembershipRefunds(user.id)
    const matching = refunds.filter(refund => refund.stripe_refund_id === refundId)
    expect(matching).toHaveLength(1)
    expect(matching[0]?.amount).toEqual({ amount: 1000, currency: 'brl' })
  })

  it('falls back to listStripeRefundsForCharge when embedded list is truncated', async () => {
    const chargeId = `ch_wch_${Math.random().toString(36).slice(2, 10)}`
    const refundId1 = `re_wch_${Math.random().toString(36).slice(2, 10)}`
    const refundId2 = `re_wch_${Math.random().toString(36).slice(2, 10)}`
    mockListStripeRefundsForCharge.mockResolvedValue({
      data: [
        { id: refundId1, amount: 500, currency: 'usd', payment_intent: 'pi_wch_2' },
        { id: refundId2, amount: 500, currency: 'usd', payment_intent: 'pi_wch_2' },
      ],
    } as never)

    const eventData = {
      id: chargeId,
      invoice: 'in_1',
      created: 1_700_000_000,
      payment_intent: 'pi_wch_2',
      refunds: { data: [], has_more: true },
    }

    await handleTestChargeRefund('evt_rec_2', eventData)

    expect(mockListStripeRefundsForCharge).toHaveBeenCalledWith(chargeId)
    const refunds = await getMembershipRefunds(user.id)
    const r1 = refunds.find(r => r.stripe_refund_id === refundId1)
    const r2 = refunds.find(r => r.stripe_refund_id === refundId2)
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
  })

  it('idempotently skips duplicate refunds via DO NOTHING', async () => {
    const chargeId = `ch_wch_${Math.random().toString(36).slice(2, 10)}`
    const refundId = `re_wch_idem_${Math.random().toString(36).slice(2, 10)}`
    const eventData = {
      id: chargeId,
      invoice: 'in_1',
      created: 1_700_000_000,
      payment_intent: 'pi_wch_idem',
      refunds: {
        data: [{ id: refundId, amount: 1000, currency: 'usd', payment_intent: 'pi_wch_idem' }],
        has_more: false,
      },
    }

    await handleTestChargeRefund('evt_idem_1', eventData)
    await handleTestChargeRefund('evt_idem_2', eventData)

    const refunds = await getMembershipRefunds(user.id)
    const matching = refunds.filter(r => r.stripe_refund_id === refundId)
    expect(matching.length).toBe(1)
  })
})
