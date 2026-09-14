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
  [
    'membership_administrator_refund_operation_requests.issued_by_id',
    'Administrator audit snapshot intentionally survives user deletion.',
  ],
  [
    'membership_administrator_refund_operation_requests.membership_id',
    'Immutable request snapshot intentionally survives membership projection deletion.',
  ],
  ['membership_changes.changed_by_id', 'Audit snapshot intentionally survives user deletion.'],
  [
    'membership_changes.membership_id',
    'Append-only audit snapshot intentionally remains queryable after the membership projection is deleted.',
  ],
  [
    'membership_changes.user_id',
    'Append-only audit snapshot intentionally survives final user deletion.',
  ],
  [
    'membership_grants.granted_by_id',
    'Issuer audit snapshot intentionally survives administrator deletion.',
  ],
  [
    'membership_grants.revoked_by_id',
    'Revoker audit snapshot intentionally survives administrator deletion.',
  ],
  [
    'membership_refunds.membership_id',
    'Append-only financial audit snapshot intentionally survives membership projection deletion.',
  ],
  [
    'membership_refunds.user_id',
    'Append-only financial audit snapshot intentionally survives final user deletion.',
  ],
  [
    'membership_refunds.issued_by_id',
    'Audit snapshot intentionally survives user deletion; null for event-sourced rows.',
  ],
])
/* v8 ignore stop */
