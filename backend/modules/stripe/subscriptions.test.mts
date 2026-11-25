import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  cancelStripeSubscriptionImmediately,
  getStripeSubscription,
  updateStripeSubscriptionPauseCollection,
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

  it('pauses collection with void and clears it with the same idempotency key style', async () => {
    const update = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'sub_pause' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { update },
    } as never)

    await updateStripeSubscriptionPauseCollection('sub_pause', 'void', 'pause-key')
    await updateStripeSubscriptionPauseCollection('sub_pause', 'clear', 'clear-key')

    expect(update).toHaveBeenNthCalledWith(
      1,
      'sub_pause',
      { pause_collection: { behavior: 'void' } },
      { idempotencyKey: 'pause-key' },
    )
    expect(update).toHaveBeenNthCalledWith(
      2,
      'sub_pause',
      { pause_collection: '' },
      { idempotencyKey: 'clear-key' },
    )
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
})
