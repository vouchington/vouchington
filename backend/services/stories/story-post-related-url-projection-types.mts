export type ProjectionWork = {
  post_id: string
  story_id: string
  generation: string
  sweep_upper_bound_source_id: string | null
  source_completed_at: Date | null
  lease_token: string | null
}

export type SourceRow = { id: string; url_id: string; url: string }
export type SourceDecision = SourceRow & { is_eligible: boolean }

export type ProjectionResult = { processed: number; continue: boolean }
