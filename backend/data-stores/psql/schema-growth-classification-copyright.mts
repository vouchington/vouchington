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
    'copyright_notice_email_intake_recommendation_identities',
    'Minimal recommendation identities preserve published ids and review provenance after operational output expires; receipt and digest indexes bound lookup.',
  ],
  [
    'copyright_notice_submission_assessment_identities',
    'Minimal assessment identities preserve published ids and exact authorization scope after detailed assessment history expires.',
  ],
  [
    'copyright_territorial_decision_identities',
    'Minimal territorial decision identities preserve published ids while the owning case stores its current result.',
  ],
  [
    'copyright_territorial_redress_decision_identities',
    'At most one minimal decision identity belongs to each durable redress request; the request stores its final result.',
  ],
  [
    'copyright_repeat_infringer_review_identities',
    'Minimal review identities preserve published ids through an unresolved review and after completed history expires.',
  ],
  [
    'copyright_repeat_infringer_account_states',
    'At most one current repeat-infringer result and open-review pointer belongs to each retained account identity.',
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
