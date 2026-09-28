export interface ModerationQueueClaim {
  id: string
  community_id: string
  report_id: string | null
  post_id: string | null
  claimed_by_id: string
  claimed_at: string
  released_at: string | null
}
