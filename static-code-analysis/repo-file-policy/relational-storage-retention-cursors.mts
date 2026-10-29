const reason =
  'Deletion-stable retention keyset coordinate or frozen sweep bound; the swept source row may no longer exist.'

export const REVIEWED_RETENTION_CURSOR_IDS = new Map<string, string>(
  [
    'import_retention_cursors.cursor_row_id',
    'import_retention_cursors.cursor_discovery_url_id',
    'user_data_request_attempt_retention_cursors.cursor_request_id',
    'user_data_request_attempt_retention_cursors.cursor_processing_attempt_id',
    'user_data_request_attempt_retention_cursors.cursor_upper_id',
    'vote_ballot_cleanup_cursors.cursor_vote_id',
    'vote_ballot_cleanup_cursors.sweep_cutoff_id',
    'vote_integrity_flag_detail_cleanup_cursors.cursor_flag_id',
    'vote_integrity_flag_detail_cleanup_cursors.sweep_cutoff_id',
    'post_moderation_retention_cursors.cursor_record_id',
    'post_moderation_retention_cursors.cursor_lower_bound_record_id',
    'post_moderation_retention_cursors.sweep_upper_bound_record_id',
  ].map(key => [key, reason] as const),
)
