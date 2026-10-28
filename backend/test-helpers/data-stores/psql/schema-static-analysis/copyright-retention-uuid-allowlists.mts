export const COPYRIGHT_RETENTION_UUID_COLUMNS_WITHOUT_KEYS: Array<[string, string]> = [
  [
    'copyright_notice_operational_retention_cursors.cursor_record_id',
    'Durable UUIDv7 keyset position can outlive the deleted operational row; it is not a relation.',
  ],
  [
    'copyright_notice_operational_retention_cursors.sweep_upper_bound_record_id',
    'Frozen UUIDv7 sweep boundary is synthetic and is not a relation.',
  ],
  [
    'copyright_notice_operational_retention_cursors.cursor_child_id',
    'Bounded thread case-link traversal position may outlive its deleted source row.',
  ],
  [
    'copyright_notice_operational_retention_cursors.cursor_edge_id',
    'Bounded thread or email ancestry traversal position may outlive its deleted edge.',
  ],
  [
    'copyright_notice_operational_retention_cursors.cursor_legal_child_id',
    'Bounded legal-party source traversal position may outlive its source row.',
  ],
  [
    'copyright_notice_operational_retention_cursors.cursor_blocker_child_id',
    'Bounded blocker-source traversal position may outlive its source row.',
  ],
]
