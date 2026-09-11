/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
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
    'membership_refund_intents.issued_by_id',
    'Append-only request identity intentionally survives user deletion.',
  ],
  [
    'membership_refund_intents.membership_id',
    'Append-only refund-intent audit snapshot intentionally survives membership projection deletion.',
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
    'Audit snapshot intentionally survives user deletion; null for webhook-sourced rows.',
  ],
])
/* v8 ignore stop */
