export const MEMBERSHIP_PRODUCT_CACHE_SCHEMA_VERSION = 'provider-v1'

export type MembershipProductCacheKey = {
  environment: 'test' | 'production'
  applicationId: string
  value: string
}

export function serializeMembershipProductCacheKey(key: MembershipProductCacheKey): string {
  return JSON.stringify([key.environment, key.applicationId, key.value])
}

export const MEMBERSHIP_PRODUCT_CACHE_PREFIXES = {
  activePlans: `membership_products:${MEMBERSHIP_PRODUCT_CACHE_SCHEMA_VERSION}:active_plans`,
  byStripePriceId: `membership_products:${MEMBERSHIP_PRODUCT_CACHE_SCHEMA_VERSION}:by_stripe_price_id`,
} as const
