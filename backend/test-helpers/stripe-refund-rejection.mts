import { createStripeRefund } from '../modules/stripe/refunds.mts'
import { createProviderReplay } from './provider-replay.mts'
import { createReplayStripeClient, loadStripeFixture } from './stripe-replay.mts'

/** A real SDK error whose provider-request history is observed by the production integration. */
export async function createTestStripeRefundRejection(
  options: { priorUnknownExecution?: boolean } = {},
): Promise<unknown> {
  const replay = createProviderReplay()
  replay.respondWith(loadStripeFixture('price-create-parameter-missing-400.http'))
  let failedConnection = false
  const client = createReplayStripeClient(async (input, init) => {
    if (options.priorUnknownExecution && !failedConnection) {
      failedConnection = true
      throw Object.assign(new Error('Connection closed after dispatch'), { code: 'ECONNRESET' })
    }
    return replay.fetch(input, init)
  })
  try {
    await createStripeRefund(
      {
        chargeId: 'ch_rejection_fixture',
        amountMinorUnits: 1,
        idempotencyKey: 'refund-rejection-fixture',
      },
      client,
    )
  } catch (err) {
    replay.assertDrained()
    return err
  }
  throw new Error('Expected the recorded Stripe request rejection')
}

export async function createTestConcurrentStripeRefundRejections(
  sharedKey: boolean,
): Promise<unknown[]> {
  const replay = createProviderReplay()
  const rejected = loadStripeFixture('price-create-parameter-missing-400.http')
  replay.respondWith(rejected, rejected)
  const client = createReplayStripeClient(replay.fetch)
  const results = await Promise.allSettled(
    [0, 1].map(index =>
      createStripeRefund(
        {
          chargeId: 'ch_concurrent_rejection',
          amountMinorUnits: 1,
          idempotencyKey: sharedKey ? 'shared-rejection-key' : `separate-rejection-key-${index}`,
        },
        client,
      ),
    ),
  )
  replay.assertDrained()
  return results.map(result => {
    if (result.status === 'fulfilled') throw new Error('Expected a recorded Stripe rejection')
    return result.reason as unknown
  })
}
