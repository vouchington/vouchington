// API-facing entity types — canonical definitions live in @voucha/types/entities/membership
export type {
  MembershipPlanSlug,
  MembershipBillingInterval,
  MembershipStatus,
  Membership,
} from '@voucha/types/entities/membership'

import type {
  MembershipBillingInterval,
  MembershipPlanSlug,
} from '@voucha/types/entities/membership'
import type { Money } from '@ts-shared/money'

export type MembershipChangeType =
  | 'upgrade'
  | 'downgrade'
  | 'renewal'
  | 'cancellation'
  | 'reactivation'
  | 'admin_grant'
  | 'admin_revoke'
  | 'pause'
  | 'refund'
  | 'sku_migration'
  | 'expiration'

export type MembershipSku = {
  id: string
  plan: MembershipPlanSlug
  price: Money
  interval: MembershipBillingInterval
  stripe_price_id: string
  retired_at: Date | null
  created_at: Date
  updated_at: Date
}

export type MembershipRefundReason = 'goodwill' | 'requested' | 'dispute' | 'other'

export type MembershipRefundSource = 'admin' | 'stripe_dashboard'

export type StripeMoney = {
  amount: number
  currency: string
}

export type MembershipRefund = {
  id: string
  membership_id: string
  user_id: string
  stripe_refund_id: string
  stripe_charge_id: string
  stripe_payment_intent_id: string | null
  stripe_idempotency_key: string | null
  admin_request_fingerprint: string | null
  amount: StripeMoney
  reason: MembershipRefundReason
  revoked_access: boolean
  issued_by_id: string | null
  source: MembershipRefundSource
  stripe_event_id: string | null
  note: string | null
  created_at: Date
}

/** A refundable charge line item for the admin refund picker UI. */
export type RefundableCharge = {
  charge_id: string | null
  payment_intent_id: string | null
  invoice_id: string
  amount: Money
  amount_refunded: Money
  created_at: Date
  description: string | null
}

export type MembershipRefundRow = Omit<MembershipRefund, 'amount'> & {
  amount_minor_units: string
  currency_code: string
}

export type MembershipChange = {
  id: string
  membership_id: string
  user_id: string
  change_type: MembershipChangeType
  from_plan: MembershipPlanSlug | null
  to_plan: MembershipPlanSlug | null
  from_sku_id: string | null
  to_sku_id: string | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
  changed_by_id: string | null
  note: string | null
  stripe_event_id: string | null
  membership_provider_evidence_id: string | null
  created_at: Date
}
