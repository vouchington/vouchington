/** Minimal protocol fences and key metadata with intentionally no time-based row cleanup. */
export const LEGAL_IDENTITY_GROWTH_POLICIES = [
  [
    'stripe_event_retained_identities',
    'Permanent minimal provider-event identity preserves financial transport deduplication after raw ledger expiry; no event payload is retained.',
  ],
  [
    'membership_operation_retained_identities',
    'Minimal terminal financial operation identity preserves exact external operation replay after the raw ledger retention window.',
  ],
  [
    'copyright_email_intake_encryption_keys',
    'One nonsecret private-intake key handle per live intake; its key object is destroyed at operational expiry independently of final receipt explanations.',
  ],
  [
    'copyright_email_receipt_encryption_keys',
    'One nonsecret key handle per retained final receipt explanation; the distinct key object retires after seventy-two months and preservation checks, while destroyed handles prevent late rekeying.',
  ],
  [
    'copyright_retention_keys',
    'Unattached reservations are reclaimed and per-owner key objects are destroyed at their distinct intake, receipt or case expiry; nonsecret destroyed-key metadata remains a negative rekey fence.',
  ],
  [
    'copyright_replay_hmac_key_versions',
    'Historical nonsecret key names, material self-checks and reference counts prevent key-name reuse; no requester identity or key material is stored.',
  ],
] as const
