// Durable copyright receipt and case projections have no fixed cardinality cap.
export const COPYRIGHT_RETENTION_UNBOUNDED_TABLES = [
  [
    'copyright_notice_email_intake_receipts',
    'Retained SES replay identities survive private intake erasure and grow with inbound email; indexed message-id reads remain selective.',
  ],
  [
    'copyright_notice_email_thread_retirements',
    'At most one durable retirement marker belongs to each copyright case; the legal case skeleton persists.',
  ],
  [
    'copyright_notice_guest_capability_identities',
    'Retained guest capability identities survive live-token pruning and grow with issuance; case and identity indexes keep reads selective.',
  ],
  [
    'copyright_notice_thread_blocker_generations',
    'One blocker generation belongs to each persistent copyright case with staff or business activity.',
  ],
  [
    'copyright_notice_thread_party_generations',
    'One party generation belongs to each persistent copyright case with legal parties.',
  ],
  [
    'copyright_notice_thread_retention_activities',
    'One indexed latest-thread-activity projection belongs to each persistent copyright case with linked email.',
  ],
] as const
