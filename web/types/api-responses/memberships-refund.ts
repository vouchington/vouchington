export interface RefundableCharge {
  charge_id: string | null
  payment_intent_id: string | null
  invoice_id: string
  amount: Money
  amount_refunded: Money
  created_at: string
  description: string | null
}

export interface RefundableChargesResponseBody {
  charges: RefundableCharge[]
}

export interface MembershipRefund {
  id: string
  membership_id: string
  user_id: string
  stripe_refund_id: string
  stripe_charge_id: string
  amount: Money
  reason: string
  revoked_access: boolean
  issued_by_id: string | null
  source: string
  note: string | null
  created_at: string
}

export interface MembershipRefundResponseBody {
  refund: { id: string }
  cancellation_status: 'not_requested' | 'completed' | 'pending'
}
import type { Money } from '@ts-shared/money'
