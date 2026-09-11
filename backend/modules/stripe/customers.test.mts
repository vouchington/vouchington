import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

import {
  getStripeCustomer,
  getOrCreateStripeCustomer,
  sanitizeStripeCustomer,
} from './customers.mts'

function makeStripeCustomer(id: string): Stripe.Customer {
  return { id, object: 'customer' } as Stripe.Customer
}

function makeStripe(overrides: Partial<Stripe['customers']>): Stripe {
  return {
    customers: overrides,
  } as unknown as Stripe
}

describe('getStripeCustomer', () => {
  it('retrieves a customer by ID', async () => {
    const customer = makeStripeCustomer('cus_test_1')
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue(customer)
    const stripe = makeStripe({ retrieve })

    const result = await getStripeCustomer('cus_test_1', { stripe })
    expect(retrieve).toHaveBeenCalledWith('cus_test_1')
    expect(result).toEqual(customer)
  })
})

describe('getOrCreateStripeCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns existing customer when found by userId metadata', async () => {
    const existing = makeStripeCustomer('cus_existing')
    const stripe = makeStripe({
      search: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [existing] }),
      create: vi.fn<VitestLooseMock>(),
    })

    const result = await getOrCreateStripeCustomer('user_123', 'a@b.com', { stripe })
    expect(result).toEqual(existing)
  })

  it('creates a new customer when none found', async () => {
    const created = makeStripeCustomer('cus_new')
    const createFn = vi.fn<VitestLooseMock>().mockResolvedValue(created)
    const stripe = makeStripe({
      search: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [] }),
      create: createFn,
    })

    const result = await getOrCreateStripeCustomer('user_456', 'b@c.com', { stripe })
    expect(result).toEqual(created)
    expect(createFn).toHaveBeenCalledWith({ email: 'b@c.com', metadata: { userId: 'user_456' } })
  })

  it('passes an idempotency key when creating a customer', async () => {
    const createFn = vi.fn<VitestLooseMock>().mockResolvedValue(makeStripeCustomer('cus_new'))
    const stripe = makeStripe({
      search: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [] }),
      create: createFn,
    })

    await getOrCreateStripeCustomer('user_456', 'tests+7997@voucha.ai', { stripe }, 'customer-key')

    expect(createFn).toHaveBeenCalledWith(
      { email: 'tests+7997@voucha.ai', metadata: { userId: 'user_456' } },
      { idempotencyKey: 'customer-key' },
    )
  })
})

describe('sanitizeStripeCustomer', () => {
  it('clears email, name, and sets redacted metadata on the Stripe customer', async () => {
    const updateFn = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cus_redacted' })
    const stripe = makeStripe({ update: updateFn })

    await sanitizeStripeCustomer('cus_redacted', { stripe })

    expect(updateFn).toHaveBeenCalledWith('cus_redacted', {
      email: '',
      name: '',
      metadata: { redacted: 'true' },
    })
  })

  it('passes an idempotency key when sanitizing a customer', async () => {
    const updateFn = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cus_redacted' })
    const stripe = makeStripe({ update: updateFn })

    await sanitizeStripeCustomer('cus_redacted', { stripe }, 'sanitize-key')

    expect(updateFn).toHaveBeenCalledWith(
      'cus_redacted',
      { email: '', name: '', metadata: { redacted: 'true' } },
      { idempotencyKey: 'sanitize-key' },
    )
  })
})
