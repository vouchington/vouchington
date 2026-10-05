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
  moderation_appeal_id: string | null
  topic_claim_id: string | null
  report_integrity_flag_id: string | null
  report_abuse_penalty_id: string | null
  vote_integrity_flag_id: string | null
  vote_weight_penalty_id: string | null
  agent_moderation_id: string | null
  agent_moderation_post_id: string | null
  oauth_client_id: string | null
  user_moderator_note_id: string | null
  crawler_id: string | null
  topic_id: string | null
  operation_request_id: string | null
  queue_name: string | null
  scheduled_job_key: string | null
  backfill_key: string | null
  rss_category_text: string | null
  admin_import_batch_id: string | null
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}
