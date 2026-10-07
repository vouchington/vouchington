export type ProjectionWork = {
  post_id: string
  story_id: string
  generation: string
  sweep_upper_bound_source_id: string | null
  sweep_upper_bound_relation_id: string | null
  relation_snapshot_at: Date
  cursor_source_id: string | null
  source_completed_at: Date | null
  cursor_prune_id: string | null
  lease_token: string | null
}

export type SourceRow = { id: string; url_id: string; url: string }
export type SourceDecision = SourceRow & { is_eligible: boolean }

export type ProjectionResult = { processed: number; continue: boolean }
