/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const ALLOWED_MEMBERSHIP_MISSING_UPDATED_AT = new Map<string, string>([
  [
    'membership_google_play_purchase_tokens',
    'Immutable token aliases are inserted once; linked-token ancestry is captured at insertion and never rewritten.',
  ],
  [
    'membership_automatic_refund_receipts',
    'Immutable provider-refund receipts are inserted once and never updated.',
  ],
  [
    'membership_grant_activation_periods',
    'Grant activation lifecycle is represented by started_at and ended_at; a generic update timestamp adds no domain meaning.',
  ],
  [
    'membership_grants',
    'Grant lifecycle is represented by revoked_at; immutable issuance fields retain their original audit meaning.',
  ],
  [
    'membership_ineligible_purchase_reversal_cases',
    'Immutable collision snapshots are inserted once and never updated.',
  ],
  [
    'membership_ineligible_purchase_reversal_case_operations',
    'Immutable case-operation associations are inserted once and never updated.',
  ],
  [
    'membership_lineage_bindings',
    'Binding lifecycle is represented by bound_at and released_at; history must retain the original binding instant.',
  ],
  [
    'membership_operations',
    'Provider operation lifecycle is represented by requested_at, completed_at, and failed_at.',
  ],
  [
    'membership_administrator_refund_operation_requests',
    'Immutable administrator refund request facts are never updated.',
  ],
  [
    'membership_provider_evidence_records',
    'Evidence verification lifecycle is represented by received_at, verified_at, and rejected_at.',
  ],
  ['membership_provider_lineages', 'Provider lineage identities are immutable once recorded.'],
  [
    'membership_provider_observations',
    'Normalized provider observations are immutable evidence-derived facts.',
  ],
  [
    'membership_sources',
    'Source lifecycle is represented by linked state and durable binding history rather than a generic mutation timestamp.',
  ],
  ['membership_changes', 'Append-only membership audit log.'],
  [
    'membership_refunds',
    'Append-only financial refund ledger; rows are never updated after insertion.',
  ],
  [
    'membership_refund_operation_attempts',
    'Append-only provider attempts only permit one-way provider refund ID enrichment.',
  ],
])
/* v8 ignore stop */
