import { describe, expect, it, vi } from 'vitest'
import { handleChargeDisputeClosed } from './webhook-dispute-handlers.mts'

describe('handleChargeDisputeClosed', () => {
  it('passes a custom membership application context to dispute reversal reconciliation', async () => {
    const reconcileWonStripeDispute = vi
      .fn<
        (options: {
          disputeId: string
          providerApplicationId?: string
          providerEnvironment: 'test' | 'production'
        }) => Promise<boolean>
      >()
      .mockResolvedValue(true)
    const applicationContext = { applicationId: 'test-custom-stripe-context' }

    await handleChargeDisputeClosed(
      { id: 'dp_custom_context' },
      'test',
      { reconcileWonStripeDispute },
      applicationContext,
    )

    expect(reconcileWonStripeDispute).toHaveBeenCalledWith({
      disputeId: 'dp_custom_context',
      providerApplicationId: applicationContext.applicationId,
      providerEnvironment: 'test',
    })
  })
})
