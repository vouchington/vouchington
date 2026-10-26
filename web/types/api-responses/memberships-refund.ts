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

interface CompletedMembershipRefundResponseBody {
  outcome: 'completed'
  refund: { id: string }
  cancellation_status: 'not_requested' | 'completed' | 'pending'
}

interface ReconcilingMembershipRefundResponseBody {
  outcome: 'reconciling'
  retry_after_seconds: number
}

export type MembershipRefundResponseBody =
  | CompletedMembershipRefundResponseBody
  | ReconcilingMembershipRefundResponseBody
import type { Money } from '@ts-shared/money'
