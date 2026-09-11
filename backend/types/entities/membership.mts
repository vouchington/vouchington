export type MembershipPlanSlug = 'plus' | 'pro'

export type MembershipBillingInterval = 'monthly' | 'yearly'

export type MembershipStatus = 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'

export type Membership = {
  __entity_type: 'membership'
  id: string
  user_id: string
  plan: MembershipPlanSlug
  status: MembershipStatus
  started_at: Date
  expires_at: Date | null
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  granted_by_id: string | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
  latest_change_id: string | null
  created_at: Date
  updated_at: Date
  sku: {
    id: string
    plan: MembershipPlanSlug
    price: Money | null
    interval: MembershipBillingInterval
    stripe_price_id: string | null
    retired_at: Date | null
  }
}
import type { Money } from '@ts-shared/money'
