export const COPYRIGHT_RETENTION_BOUNDED_TABLES: ReadonlyArray<readonly [string, string]> = [
  [
    'copyright_account_suspension_incidents',
    'Case provenance drains in bounded case-purge pages only after its suspension reliance is released.',
  ],
  [
    'copyright_account_suspension_reliances',
    'One current authority row per account; bounded postroot party pages collect released rows after their last incident bridge drains, under the final-user-purge lifetime lock.',
  ],
  [
    'copyright_case_preservation_holds',
    'Active holds block case expiry; released holds restart the case activity clock and drain with the eligible case.',
  ],
  [
    'copyright_eu_supervised_complaint_resolutions',
    'Case-owned terminal resolution drains in the bounded six-year case purge.',
  ],
  [
    'copyright_key_orphan_cleanup_cursors',
    'One checked singleton stores durable bounded key and erased-object scan positions.',
  ],
  [
    'copyright_legal_mutation_sequence_states',
    'One checked singleton stores the monotone legal mutation generation in place.',
  ],
  [
    'copyright_notice_encryption_keys',
    'One FK-bound key mapping per case; its authoritative object is destroyed before bounded case-root purge removes the mapping.',
  ],
  [
    'copyright_notice_minimal_purge_continuations',
    'One continuation per admitted case; capped proof and erasure pages finish with postroot bookkeeping removal.',
  ],
  [
    'copyright_notice_minimal_purge_cursors',
    'A fixed checked family vocabulary stores one keyset position per case candidate stream.',
  ],
  [
    'copyright_notice_replay_receipts',
    'Exact live receipt snapshots are case children removed by bounded case purge; retained replay identities contain no snapshot.',
  ],
  [
    'copyright_notice_retained_identities',
    'Bounded case purge drains promoted-intake reviews and retained parties before removing the original case identity.',
  ],
  [
    'copyright_notice_retained_parties',
    'Bounded postroot pages remove party references after their account-purge activity and suspension blockers are satisfied.',
  ],
  [
    'copyright_replay_cleanup_cursors',
    'A fixed checked two-family vocabulary stores bounded identity/group scan positions.',
  ],
  [
    'copyright_replay_identities',
    'Bounded raw UUID pages delete identities after the configured ten-year window following the later of final case purge and authorized last replay.',
  ],
  [
    'copyright_replay_retention_groups',
    'Bounded group cleanup removes purged groups once no case or retained replay identity references them.',
  ],
  [
    'copyright_submission_key_retention_cursors',
    'A fixed submission-key cleanup family stores one durable deletion-stable position.',
  ],
  [
    'copyright_territorial_escalation_closures',
    'Case-owned closure restarts the six-year activity clock and drains with the eligible case.',
  ],
  [
    'copyright_transparency_erased_source_ranges',
    'One checked singleton stores a compact nonpersonal erased-source envelope in place.',
  ],
  [
    'legal_record_retention_cursors',
    'A fixed legal-record cleanup family vocabulary stores one durable position per retained record type.',
  ],
  [
    'payment_ledger_retention_cursors',
    'A fixed financial-ledger cleanup family vocabulary stores one durable position per ledger type.',
  ],
]
