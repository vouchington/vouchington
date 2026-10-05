/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'membership_google_play_acknowledgements.attempt_claim_token',
    'Ephemeral fencing token for the current acknowledgement processor; it intentionally identifies no durable relation.',
  ],
  [
    'membership_google_play_recovery_cursors.last_evidence_id',
    'Durable keyset cursor intentionally survives evidence deletion so completed recovery progress cannot rewind.',
  ],
  [
    'membership_google_play_recovery_cursors.sweep_upper_bound_id',
    'Finite UUIDv7 high-water boundary for one recovery sweep; it is a cursor value, not a reference to a durable row.',
  ],
  [
    'membership_microsoft_store_credentials.processing_claim_token',
    'Ephemeral fencing token for the current credential reconciliation; it identifies no durable relation.',
  ],
  [
    'membership_microsoft_store_recovery_cursors.last_source_id',
    'Durable keyset cursor intentionally survives source deletion so completed recovery progress cannot rewind.',
  ],
  [
    'membership_microsoft_store_recovery_cursors.sweep_upper_bound_id',
    'Finite UUIDv7 high-water boundary for one recovery sweep; it is a cursor value, not a reference to a durable row.',
  ],
])
/* v8 ignore stop */
