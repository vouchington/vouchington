import { storyText } from './story-mutation-bodies'

export function purchaseIntent(body: unknown): unknown {
  return {
    purchase_intent: {
      id: 'intent-story',
      provider: 'stripe',
      product_id: storyText(body, 'product_id') || 'plus-monthly',
      launch: {
        kind: 'stripe_checkout',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_storybook',
      },
      replayed: false,
    },
  }
}
