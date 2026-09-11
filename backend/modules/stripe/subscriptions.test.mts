import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  cancelStripeSubscription,
  cancelStripeSubscriptionImmediately,
  getStripeSubscription,
} from './subscriptions.mts'

describe('stripe subscriptions module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retrieves subscriptions with the schedule prices needed for renewal facts', async () => {
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'sub_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { retrieve },
    } as never)

    await expect(getStripeSubscription('sub_123')).resolves.toEqual({ id: 'sub_123' })
    expect(retrieve).toHaveBeenCalledWith('sub_123', {
      expand: ['schedule.phases.items.price'],
    })
  })

  it('marks subscriptions to cancel at period end', async () => {
    const update = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'sub_456' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { update },
    } as never)

    await expect(cancelStripeSubscription('sub_456')).resolves.toEqual({ id: 'sub_456' })
    expect(update).toHaveBeenCalledWith('sub_456', { cancel_at_period_end: true })
  })

  it('cancels subscriptions immediately', async () => {
    const cancel = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'sub_789' })
    const retrieve = vi.fn<VitestLooseMock>()
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { cancel, retrieve },
    } as never)

    await expect(cancelStripeSubscriptionImmediately('sub_789')).resolves.toEqual({ id: 'sub_789' })
    expect(cancel).toHaveBeenCalledWith('sub_789')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('passes an idempotency key for scheduled cancellation', async () => {
    const update = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'sub_scheduled' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { update },
    } as never)

    await cancelStripeSubscription('sub_scheduled', 'scheduled-key')

    expect(update).toHaveBeenCalledWith(
      'sub_scheduled',
      { cancel_at_period_end: true },
      { idempotencyKey: 'scheduled-key' },
    )
  })

  it('converges when DELETE fails after the subscription was canceled', async () => {
    const cancelError = new Error('DELETE reply was lost')
    const canceledSubscription = { id: 'sub_canceled', status: 'canceled' }
    const cancel = vi.fn<VitestLooseMock>().mockRejectedValue(cancelError)
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue(canceledSubscription)
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { cancel, retrieve },
    } as never)

    await expect(cancelStripeSubscriptionImmediately('sub_canceled')).resolves.toBe(
      canceledSubscription,
    )
    expect(cancel).toHaveBeenCalledWith('sub_canceled')
    expect(retrieve).toHaveBeenCalledWith('sub_canceled')
  })

  it('rethrows the original DELETE failure when the subscription remains active', async () => {
    const cancelError = new Error('DELETE forbidden')
    const cancel = vi.fn<VitestLooseMock>().mockRejectedValue(cancelError)
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'sub_active',
      status: 'active',
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { cancel, retrieve },
    } as never)

    await expect(cancelStripeSubscriptionImmediately('sub_active')).rejects.toBe(cancelError)
  })

  it('rethrows the original DELETE failure when retrieval also fails', async () => {
    const cancelError = new Error('DELETE used the wrong account')
    const retrieveError = new Error('subscription not found')
    const cancel = vi.fn<VitestLooseMock>().mockRejectedValue(cancelError)
    const retrieve = vi.fn<VitestLooseMock>().mockRejectedValue(retrieveError)
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { cancel, retrieve },
    } as never)

    await expect(cancelStripeSubscriptionImmediately('sub_missing')).rejects.toBe(cancelError)
  })
})
