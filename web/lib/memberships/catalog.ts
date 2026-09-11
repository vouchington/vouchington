import type {
  EffectiveMembership,
  MembershipCatalogProduct,
  MembershipPlanSku,
  MembershipProviderManagement,
  SubscriptionMembership,
} from '@/types/api-responses'

export function groupStripeMembershipProducts(
  products: MembershipCatalogProduct[],
): Record<string, MembershipPlanSku[]> {
  const grouped: Record<string, MembershipPlanSku[]> = {}
  for (const product of products) {
    const stripe = product.providers.find(reference => reference.provider === 'stripe')
    if (!stripe?.price) continue
    const sku: MembershipPlanSku = {
      id: product.id,
      plan: product.plan,
      interval: product.interval,
      price: stripe.price,
      stripe_price_id: stripe.product_id,
    }
    ;(grouped[product.plan] ??= []).push(sku)
  }
  return grouped
}

export function toUiMembership(
  membership: EffectiveMembership,
  products: MembershipCatalogProduct[],
  management: MembershipProviderManagement | null,
): SubscriptionMembership {
  const catalogProduct = products.find(product => product.id === membership.product.id)
  const stripe = catalogProduct?.providers.find(reference => reference.provider === 'stripe')
  return {
    ...membership,
    has_stripe_subscription: management?.provider === 'stripe',
    sku: {
      ...membership.product,
      price: stripe?.price ?? null,
      stripe_price_id: stripe?.product_id ?? null,
    },
  }
}
