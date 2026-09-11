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
  livemode: boolean
  api_version: string | null
  stripe_created_at: Date
  customer_id: string | null
  subscription_id: string | null
  invoice_id: string | null
  checkout_session_id: string | null
  status: StripeEventProcessingStatus
  received_at: Date
  processing_attempt_id: string
  dispatched_at: Date
  processing_started_at: Date | null
  processing_attempts: number
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
