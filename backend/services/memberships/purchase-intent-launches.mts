import { createHash } from 'node:crypto'
import type { MembershipPlanSlug } from './types.mts'

export type MembershipPurchaseProvider =
  | 'stripe'
  | 'apple_app_store'
  | 'google_play'
  | 'microsoft_store'

export type MembershipPurchaseLaunch =
  | { kind: 'stripe_checkout'; checkout_url: string }
  | { kind: 'apple_app_store'; product_id: string; app_account_token: string }
  | {
      kind: 'google_play'
      product_id: string
      base_plan_id: string | null
      offer_id: string | null
      obfuscated_account_id: string
    }
  | { kind: 'microsoft_store'; product_id: string; sku_id: string | null }

export type MembershipPurchaseIntent = {
  id: string
  provider: MembershipPurchaseProvider
  product_id: string
  launch: MembershipPurchaseLaunch
  replayed: boolean
}

export type PurchaseIntentRow = {
  id: string
  user_id: string
  request_fingerprint: string
  membership_product_id: string
  provider: MembershipPurchaseProvider
  environment: 'test' | 'production'
  application_id: string
  provider_product_id: string
  base_plan_id: string | null
  offer_id: string | null
  sku_id: string | null
  plan: MembershipPlanSlug
  provider_checkout_url: string | null
  launched_at: Date | null
  failed_at: Date | null
  failure_code: string | null
  expires_at: Date
}

export function createMembershipPurchaseIntentFingerprint(
  provider: MembershipPurchaseProvider,
  productId: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ product_id: productId, provider }))
    .digest('hex')
}

export function toPurchaseIntent(
  row: PurchaseIntentRow,
  replayed: boolean,
): MembershipPurchaseIntent {
  const launch =
    row.provider === 'stripe'
      ? row.provider_checkout_url
        ? ({ kind: 'stripe_checkout', checkout_url: row.provider_checkout_url } as const)
        : null
      : getNativeMembershipLaunch(row)
  if (!launch) throw new Error('Launched Stripe purchase intent has no Checkout URL')
  return {
    id: row.id,
    provider: row.provider,
    product_id: row.membership_product_id,
    launch,
    replayed,
  }
}

export function getNativeMembershipLaunch(
  row: Pick<
    PurchaseIntentRow,
    'id' | 'user_id' | 'provider' | 'provider_product_id' | 'base_plan_id' | 'offer_id' | 'sku_id'
  >,
): Exclude<MembershipPurchaseLaunch, { kind: 'stripe_checkout' }> {
  switch (row.provider) {
    case 'apple_app_store':
      return { kind: row.provider, product_id: row.provider_product_id, app_account_token: row.id }
    case 'google_play':
      return {
        kind: row.provider,
        product_id: row.provider_product_id,
        base_plan_id: row.base_plan_id,
        offer_id: row.offer_id,
        obfuscated_account_id: createHash('sha256').update(row.user_id).digest('hex'),
      }
    case 'microsoft_store':
      return { kind: row.provider, product_id: row.provider_product_id, sku_id: row.sku_id }
    case 'stripe':
      throw new Error('Stripe purchase intents do not use a native launch payload')
  }
}

export function getMembershipManagementDestination(provider: MembershipPurchaseProvider) {
  const destinations = {
    stripe: 'billing_portal',
    apple_app_store: 'apple_subscriptions',
    google_play: 'google_play_subscriptions',
    microsoft_store: 'microsoft_services_subscriptions',
  } as const satisfies Record<MembershipPurchaseProvider, string>
  return destinations[provider]
}
