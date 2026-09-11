import type Stripe from 'stripe'
import type { InsertStripeEventResult, StripeEventRecord, StripeEventRow } from './events-types.mts'

export function hydrateStripeEventRecord(
  row: StripeEventRow & { is_new: boolean },
): InsertStripeEventResult
export function hydrateStripeEventRecord(row: StripeEventRow): StripeEventRecord
export function hydrateStripeEventRecord(
  row: StripeEventRow | (StripeEventRow & { is_new: boolean }),
): StripeEventRecord | InsertStripeEventResult {
  return {
    ...row,
    status: deriveStripeEventProcessingStatus(row),
    payload: row.payload as Stripe.Event,
  }
}

function deriveStripeEventProcessingStatus(row: StripeEventRow): StripeEventRecord['status'] {
  if (row.failed_at) return 'failed'
  if (row.ignored_at) return 'ignored'
  if (row.processed_at) return 'processed'
  if (row.processing_started_at) return 'processing'
  return 'received'
}
