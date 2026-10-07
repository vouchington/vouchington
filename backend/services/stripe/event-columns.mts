import sql from 'sql-template-strings'

export function stripeEventColumns() {
  return sql`
    event.id, event.stripe_event_id, event.stripe_event_type_id, event.is_live_mode,
    event.api_version, event.occurred_at, event.customer_id, event.subscription_id,
    event.invoice_id, event.checkout_session_id, event.received_at, event.payload, event.created_at,
    work.lease_token, work.dispatched_at, work.leased_at, work.lease_expires_at,
    work.attempt_count, work.available_at, work.processed_at, work.ignored_at,
    work.failed_at, work.last_error_at, work.last_error_message
  `
}
