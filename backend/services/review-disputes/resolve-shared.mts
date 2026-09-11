import sql from 'sql-template-strings'
import type { ReviewDispute } from './config.mts'

export const DISPUTE_RETURNING = sql`
  id, post_id, topic_id, disputant_user_id, reason, claim_text,
  CASE
    WHEN resolved_at IS NULL THEN 'pending'
    WHEN resolution_action = 'dismiss' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  recommended_action, ai_public_response, ai_internal_response, model, ai_drafted_at,
  public_response, internal_notes, drafted_at, edited_at, edited_by_id,
  approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
  resolution_action, latest_lifecycle_change_id, updated_at,
  (SELECT community_id FROM posts WHERE posts.id = review_disputes.post_id) AS community_id,
  (SELECT created_by_id FROM posts WHERE posts.id = review_disputes.post_id) AS post_author_id
`

export type ReviewDisputeResolutionRow = ReviewDispute & {
  community_id: string | null
  post_author_id: string | null
}
