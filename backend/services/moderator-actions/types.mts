import type { ModeratorActionType } from './config.mts'

export interface ModeratorActionCounts {
  actor_id: string
  total: number
  counts: Partial<Record<ModeratorActionType, number>>
}

export interface ModeratorAction {
  id: string
  community_id: string | null
  actor_id: string | null
  action_type: ModeratorActionType
  post_id: string | null
  target_user_id: string | null
  report_id: string | null
  review_dispute_id: string | null
  community_application_id: string | null
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}
