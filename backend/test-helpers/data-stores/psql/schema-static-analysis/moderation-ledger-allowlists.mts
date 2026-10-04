/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const POST_MODERATION_TABLES_WITHOUT_CREATED_AT = new Map<string, string>([
  [
    'post_moderation_dispositions',
    'Append-only disposition ledger; decided_at is the semantic creation timestamp derived from its UUIDv7 id.',
  ],
  [
    'post_moderation_work_items',
    'Composite-key work projection whose lifecycle is represented by available, leased, lease-expiry, and completed timestamps.',
  ],
])

export const POST_MODERATION_TABLES_WITHOUT_UPDATED_AT = new Map<string, string>([
  [
    'community_post_review_changes',
    'Append-only audit history of community publication decisions and platform overrides.',
  ],
  [
    'post_moderation_attempts',
    'Attempt lifecycle mutations are represented by completed_at or failed_at; a generic updated_at would duplicate state.',
  ],
  [
    'post_moderation_dispositions',
    'Append-only disposition ledger; rows never update after insertion.',
  ],
  [
    'post_moderation_versions',
    'Immutable content-and-policy versions; rows never update after insertion.',
  ],
  [
    'post_moderation_work_items',
    'Work lifecycle mutations are represented by available_at, leased_at, lease_expires_at, and completed_at.',
  ],
])

export const MODERATION_LINK_TABLES_WITHOUT_UPDATED_AT = new Map<string, string>([
  [
    'moderator_action_community_restrictions',
    'Immutable link from an append-only moderator action to a restriction; rows are inserted with the action and only cascade-deleted.',
  ],
  [
    'report_integrity_flag_reporters',
    'Immutable detection-time reporter set for a flag; rows are inserted with the flag and only cascade-deleted.',
  ],
])

export const HISTORY_WORKFLOW_TABLES_WITHOUT_UPDATED_AT = [
  [
    'copyright_trusted_flagger_changes',
    'Immutable trusted-flagger transitions; creation time records the transition.',
  ],
  [
    'copyright_notice_lifecycle_change_rationales',
    'Only controlled case retention overwrites ciphertext; the owning retention-erasure ledger records that lifecycle timestamp.',
  ],
  [
    'copyright_notice_form_screening_attempts',
    'Claim and terminal timestamps describe the monotonic attempt lifecycle.',
  ],
  [
    'copyright_notice_lifecycle_changes',
    'Immutable lifecycle ledger; private rationale retention lives in the companion row.',
  ],
  [
    'media_delivery_registry_changes',
    'Immutable delivery transitions; current progress is read from the latest row.',
  ],
] as const

/* v8 ignore stop */
