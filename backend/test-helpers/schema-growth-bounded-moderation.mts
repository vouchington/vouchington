export const MODERATION_BOUNDED_TABLES: ReadonlyArray<readonly [string, string]> = [
  [
    'moderation_record_cleanup_cursors',
    'One durable UUIDv7 keyset position per moderation retention family.',
  ],
  ['moderation_cases', 'Resolved cases are deleted after all child records expire.'],
  ['moderation_appeals', 'Resolved appeals are deleted after 24 months.'],
  ['moderation_appeal_lifecycle_changes', 'Cascades from the bounded appeal parent.'],
  ['review_disputes', 'Resolved disputes are deleted after 24 months.'],
  ['review_dispute_lifecycle_changes', 'Cascades from the bounded dispute parent.'],
  ['moderator_actions', 'System actions expire after 90 days and staff actions after 24 months.'],
  ['report_integrity_flags', 'Resolved flags expire after 180 days.'],
  ['report_integrity_flag_reporters', 'Cascades from the bounded integrity flag parent.'],
  ['user_warnings', 'Warnings expire after the appeal window and any linked appeals.'],
  ['user_suspensions', 'Lifted rows expire after 12 months and any linked appeals.'],
  ['community_bans', 'Lifted or expired rows expire after 12 months and any linked appeals.'],
  ['community_applications', 'Decided applications expire after 12 months.'],
]
