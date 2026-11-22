import { onTestFinished, vi } from 'vitest'
import * as stripeClient from '../modules/stripe/client.mts'
import { createProviderReplay } from 'vouchington-tooling/provider-replay'
import { createReplayStripeClient, loadStripeFixture, routeStripeReplay } from './stripe-replay.mts'

/** Resolve fixture PaymentIntents through the real SDK without reading credentials or using the network. */
export function replayStripePaymentIntentCharges(
  payments: ReadonlyArray<{ paymentIntentId: string; chargeId: string }>,
): void {
  const replay = createProviderReplay()
  const routes = routeStripeReplay(replay)
  for (const payment of payments) {
    routes.on(
      'GET',
      `/v1/payment_intents/${payment.paymentIntentId}`,
      loadStripeFixture('payment-intent-latest-charge.http', {
        PAYMENT_INTENT_ID: payment.paymentIntentId,
        CHARGE_ID: payment.chargeId,
      }),
    )
  }
  const client = vi
    .spyOn(stripeClient, 'getStripeClient')
    .mockReturnValue(createReplayStripeClient(routes.fetch))
  onTestFinished(() => {
    client.mockRestore()
    routes.assertAnswered()
    replay.assertDrained()
  })
}
