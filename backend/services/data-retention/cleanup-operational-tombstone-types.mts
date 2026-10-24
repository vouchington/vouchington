export type OperationalTombstoneCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: { at: string; id: string } | null
}

export type OperationalTombstonePageResult = OperationalTombstoneCleanupResult & {
  stalled: boolean
}

export type OperationalTombstoneCursor = {
  cursor_at: string | null
  cursor_id: string | null
  sweep_cutoff_at: Date | null
}

export type OperationalTombstoneCandidate = { id: string; position_at: string }
