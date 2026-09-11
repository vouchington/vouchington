export type ProjectionWork = {
  post_id: string
  story_id: string
  generation: string
  source_high_water_id: string | null
  relation_high_water_id: string | null
  relation_snapshot_at: Date
  source_cursor_id: string | null
  source_completed_at: Date | null
  prune_cursor_id: string | null
  lease_token: string | null
}

export type SourceRow = { id: string; url_id: string; url: string }
export type SourceDecision = SourceRow & { eligible: boolean }

export type ProjectionResult = { processed: number; continue: boolean }
