import { EventEmitter } from 'node:events'
import type Stripe from 'stripe'

/** SDK request events wrap the mocked transport, including a test's one-shot refund response. */
export function createStripeRefundSdkMock(createRefund: Stripe['refunds']['create']) {
  const events = new EventEmitter()
  return {
    on: (event: 'request', listener: (event: Stripe.RequestEvent) => void) =>
      events.on(event, listener),
    off: (event: 'request', listener: (event: Stripe.RequestEvent) => void) =>
      events.off(event, listener),
    create: (...args: Parameters<Stripe['refunds']['create']>) => {
      events.emit('request', {
        method: 'POST',
        path: '/v1/refunds',
        idempotency_key: args[1]?.idempotencyKey,
      })
      return createRefund(...args)
    },
  }
}
