/** Exact operational scan positions survive deletion and never authorize an entity. */
export const RETENTION_UUID_COLUMNS_WITHOUT_KEYS: ReadonlyMap<string, string> = new Map([
  [
    'copyright_notice_minimal_purge_continuations.cursor_purge_record_id',
    'Deletion-stable raw owner-unit scan position; current keepers do not authorize or block later pages.',
  ],
  [
    'copyright_notice_email_intake_receipts.current_preservation_hold_token',
    'Opaque UUID token authenticating only the current receipt preservation transition; no entity lookup or retained legal history.',
  ],
  [
    'copyright_key_orphan_cleanup_cursors.cursor_key_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_key_orphan_cleanup_cursors.cursor_storage_object_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_notice_minimal_purge_continuations.blocker_cursor',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_notice_minimal_purge_continuations.erasure_intake_cursor',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_notice_minimal_purge_continuations.erasure_object_owner_cursor',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_notice_minimal_purge_continuations.party_scan_cursor',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_notice_minimal_purge_cursors.cursor_notice_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_replay_cleanup_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_submission_key_retention_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'legal_record_retention_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'legal_record_retention_cursors.cursor_sweep_upper_id',
    'Deletion-stable UUIDv7 sweep upper bound; the scanned rows may be deleted before the sweep ends.',
  ],
  [
    'payment_ledger_retention_cursors.cursor_record_id',
    'Deletion-stable UUIDv7 scan position; the scanned row may be deleted before the next bounded page.',
  ],
  [
    'copyright_key_orphan_cleanup_cursors.cursor_sweep_upper_bound',
    'Frozen UUIDv7 timestamp boundary for a bounded scan pass; it need not name a persisted row.',
  ],
  [
    'copyright_notice_minimal_purge_cursors.cursor_sweep_upper_bound',
    'Frozen UUIDv7 timestamp boundary for a bounded scan pass; it need not name a persisted row.',
  ],
])
