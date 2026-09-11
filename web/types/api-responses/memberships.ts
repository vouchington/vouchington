import type { Money } from '@ts-shared/money'

export type MembershipPurchaseProvider =
  | 'stripe'
  | 'apple_app_store'
  | 'google_play'
  | 'microsoft_store'

export type MembershipVerificationReasonCode =
  | 'verified'
  | 'competing_direct_source'
  | 'invalid_evidence'
  | 'wrong_account'
  | 'wrong_application'
  | 'wrong_product'
  | 'wrong_environment'
  | 'revoked'
  | 'stale_evidence'
  | 'expired'
  | 'purchase_pending'
  | 'missing_account_token'

export interface MembershipPlanSku {
  id: string
  plan: string
  price: Money
  interval: string
  stripe_price_id: string
}

export interface MembershipPlansResponseBody {
  products: MembershipCatalogProduct[]
  benefit_catalog: MembershipBenefitCatalog
}

export interface MembershipCatalogProviderReference {
  provider: MembershipPurchaseProvider
  environment: 'test' | 'production'
  application_id: string
  product_id: string
  base_plan_id: string | null
  offer_id: string | null
  sku_id: string | null
  price: Money | null
}

export interface MembershipCatalogProduct {
  id: string
  plan: string
  interval: string
  providers: MembershipCatalogProviderReference[]
}

export type MembershipBenefitPlan = 'free' | 'plus' | 'pro'
export type MembershipBenefitPlacement = 'card' | 'comparison'
export type MembershipBenefitValue =
  | { kind: 'access'; access: 'after_wait' | 'immediate' }
  | { kind: 'availability'; included: boolean }
  | {
      kind: 'level'
      level: 'none' | 'standard' | 'more' | 'most' | 'higher' | 'priority' | 'highest_priority'
    }
  | { kind: 'quantity'; quantity: number }

export interface MembershipBenefit {
  id: string
  placements: MembershipBenefitPlacement[]
  values: Record<MembershipBenefitPlan, MembershipBenefitValue>
}

export interface MembershipBenefitGroup {
  id: string
  benefits: MembershipBenefit[]
}

export interface MembershipBenefitCatalog {
  version: number
  groups: MembershipBenefitGroup[]
}

export interface MembershipSku {
  id: string
  plan: string
  price: Money | null
  interval: string
  stripe_price_id: string | null
  retired_at: string | null
}

export interface SubscriptionMembership {
  __entity_type: 'membership'
  id: string
  user_id: string
  plan: string
  status: string
  started_at: string
  expires_at: string | null
  has_stripe_subscription: boolean
  granted_by_id: string | null
  cancelled_at: string | null
  expired_at: string | null
  past_due_at: string | null
  paused_at: string | null
  cancel_at_period_end: boolean
  latest_change_id: string | null
  created_at: string
  updated_at: string
  sku: MembershipSku
}

export interface EffectiveMembership extends Omit<
  SubscriptionMembership,
  'has_stripe_subscription' | 'sku'
> {
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
  product: Pick<MembershipSku, 'id' | 'plan' | 'interval' | 'retired_at'>
}

export interface MembershipSourceSummary {
  id: string
  kind: 'direct' | 'family' | 'admin_grant'
  provider: MembershipPurchaseProvider | null
  plan: string
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused' | 'revoked'
  effective_at: string
  access_ends_at: string | null
  auto_renews: boolean
  is_effective: boolean
  renewal: { product_id: string; effective_at: string; price: Money | null } | null
}

export interface MembershipProviderManagement {
  provider: MembershipPurchaseProvider
  destination:
    | 'billing_portal'
    | 'apple_subscriptions'
    | 'google_play_subscriptions'
    | 'microsoft_services_subscriptions'
}

export interface MembershipResponseBody {
  membership: EffectiveMembership | null
  sources: MembershipSourceSummary[]
  pending: {
    grants: number
    switches: Array<{
      source_id: string
      provider: MembershipPurchaseProvider | null
      plan: string
      eligible_at: string
    }>
    verifications: Array<{
      id: string
      provider: MembershipPurchaseProvider
      status: 'pending' | 'verified' | 'conflict' | 'rejected'
      reason_code: MembershipVerificationReasonCode | null
      next_processing_at: string | null
    }>
    financial_operations: Array<{
      id: string
      provider: MembershipPurchaseProvider
      kind:
        | 'cancel_source'
        | 'automatic_refund'
        | 'ineligible_purchase_reversal'
        | 'collision_resolution'
      status: 'pending' | 'failed'
    }>
  }
  management: MembershipProviderManagement | null
}
