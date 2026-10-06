import type Stripe from 'stripe'

export type StripeEventProcessingStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed'

export type StripeEventRecord = {
  id: string
  stripe_event_id: string
  event_type: string
  is_live_mode: boolean
  api_version: string | null
  occurred_at: Date
  customer_id: string | null
  subscription_id: string | null
  invoice_id: string | null
  checkout_session_id: string | null
  status: StripeEventProcessingStatus
  received_at: Date
  lease_token: string
  dispatched_at: Date
  lease_expires_at: Date | null
  available_at: Date
  leased_at: Date | null
  attempt_count: number
  processed_at: Date | null
  ignored_at: Date | null
  failed_at: Date | null
  last_error_at: Date | null
  last_error_message: string | null
  payload: Stripe.Event
  created_at: Date
}

export type InsertStripeEventResult = StripeEventRecord & { is_new: boolean }

export type StripeEventRow = Omit<StripeEventRecord, 'payload' | 'status'> & {
  payload: unknown
}
