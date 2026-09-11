import { describe, expect, it, vi, afterEach } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createBillingPortalSession } from './portal.mts'

describe('stripe portal module', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates billing portal sessions with the expected Stripe payload', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'bps_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      billingPortal: { sessions: { create } },
    } as never)

    await expect(
      createBillingPortalSession('cus_123', 'https://example.com/account'),
    ).resolves.toEqual({ id: 'bps_123' })
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://example.com/account',
    })
  })

  it('passes the billing portal idempotency key to Stripe', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'bps_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      billingPortal: { sessions: { create } },
    } as never)

    await createBillingPortalSession('cus_123', 'https://example.com/account', 'billing-portal-key')

    expect(create).toHaveBeenCalledWith(
      { customer: 'cus_123', return_url: 'https://example.com/account' },
      { idempotencyKey: 'billing-portal-key' },
    )
  })
})
