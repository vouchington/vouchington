export const MODERATION_CLEANUP_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'moderation_media_reveal_cleanup_cursors.cursor_reveal_id',
    'Operational keyset position survives deletion of the swept reveal; it is not a relationship.',
  ],
  [
    'moderation_queue_claim_cleanup_cursors.cursor_claim_id',
    'Operational keyset position survives deletion of the swept claim; it is not a relationship.',
  ],
])
