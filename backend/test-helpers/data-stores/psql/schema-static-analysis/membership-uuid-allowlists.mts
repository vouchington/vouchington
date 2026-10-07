/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'membership_renewal_price_increase_notification_work_items.lease_token',
    'Opaque notice delivery fence; not a relationship.',
  ],
  [
    'membership_operation_execution_work_items.lease_token',
    'Opaque execution lease fence; not a relationship.',
  ],
  ['stripe_event_processing_work_items.lease_token', 'Opaque event-processing ownership token.'],
  ['membership_verification_processing_work_items.lease_token', 'Opaque adapter ownership token.'],
  [
    'membership_google_play_acknowledgment_work_items.lease_token',
    'Ephemeral fencing token for the current acknowledgement processor; it intentionally identifies no durable relation.',
  ],
  [
    'membership_google_play_recovery_cursors.cursor_evidence_id',
    'Durable keyset cursor intentionally survives evidence deletion so completed recovery progress cannot rewind.',
  ],
  [
    'membership_google_play_recovery_cursors.sweep_upper_bound_evidence_id',
    'Finite UUIDv7 high-water boundary for one recovery sweep; it is a cursor value, not a reference to a durable row.',
  ],
  [
    'membership_microsoft_store_recovery_cursors.cursor_source_id',
    'Durable keyset cursor intentionally survives source deletion so completed recovery progress cannot rewind.',
  ],
  [
    'membership_microsoft_store_recovery_cursors.sweep_upper_bound_source_id',
    'Finite UUIDv7 high-water boundary for one recovery sweep; it is a cursor value, not a reference to a durable row.',
  ],
])
/* v8 ignore stop */
