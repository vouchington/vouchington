export const USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  [
    'user_deletion_relation_impacts.entity_relation_id',
    'Relation-table-qualified identifier; a foreign key would be polymorphic and is forbidden.',
  ],
  [
    'user_deletion_requests.processing_attempt_id',
    'Fencing token rotated for each queue attempt; it intentionally identifies no durable relation.',
  ],
  [
    'user_deletion_requests.requested_by_id',
    'Audit actor identifier intentionally survives requester deletion.',
  ],
  [
    'user_deletion_requests.user_id',
    'Deleted account identifier intentionally survives the account hard delete for durable recovery evidence.',
  ],
])
