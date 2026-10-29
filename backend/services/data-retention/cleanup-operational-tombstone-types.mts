export type OperationalTombstoneCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: { at: string; id: string } | null
  /** A locked child stopped this pass; the scheduled seed will retry after the lock clears. */
  stalled?: boolean
}

export type OperationalTombstonePageResult = OperationalTombstoneCleanupResult & {
  stalled: boolean
}

export type OperationalTombstoneCursor = {
  cursor_at: string | null
  cursor_record_id: string | null
  sweep_cutoff_at: Date | null
}

export type OperationalTombstoneCandidate = { id: string; position_at: string }
