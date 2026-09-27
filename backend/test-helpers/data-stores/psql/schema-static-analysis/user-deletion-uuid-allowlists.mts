export const USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'user_deletion_requests.processing_attempt_id',
    'Fencing token rotated for each queue attempt; it intentionally identifies no durable relation.',
  ],
])
