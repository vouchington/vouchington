export const MODERATION_RETENTION_BOUNDED_TABLES = new Map<string, string>([
  [
    'moderation_queue_claims',
    'Daily keyset cleanup deletes claims more than one day old once their last claim activity is also older than one day.',
  ],
  [
    'moderation_media_reveals',
    'Daily keyset cleanup deletes reveals more than seven days old once their reveal time is also older than seven days.',
  ],
  [
    'moderation_queue_claim_cleanup_cursors',
    'Checked singleton stores one durable claim retention keyset position.',
  ],
  [
    'moderation_media_reveal_cleanup_cursors',
    'Checked singleton stores one durable media reveal retention keyset position.',
  ],
])
