/** Nullable actor snapshots and lifecycle pointers intentionally outlive their owners. */
export const MODERATION_LIFECYCLE_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  ['moderation_appeals.approved_by_id', 'Audit ownership survives moderator deletion.'],
  [
    'moderation_appeals.edited_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'moderation_appeals.latest_lifecycle_change_id',
    'Denormalized pointer to latest lifecycle change row; no FK needed.',
  ],
  [
    'moderation_appeals.resolved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  ['post_dispute_annotations.removed_by_id', 'Audit snapshot survives user deletion.'],
  [
    'review_dispute_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'review_disputes.approved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'review_disputes.edited_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'review_disputes.latest_lifecycle_change_id',
    'Denormalized pointer to latest lifecycle change row; no FK needed.',
  ],
  [
    'review_disputes.resolved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
])
