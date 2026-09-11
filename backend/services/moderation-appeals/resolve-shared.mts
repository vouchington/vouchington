import sql from 'sql-template-strings'

export const APPEAL_RETURNING = sql`
  id, case_id, appellant_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
  appeal_reason,
  CASE
    WHEN resolved_at IS NULL THEN 'pending'
    WHEN resolution_action = 'deny' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  recommended_action, ai_public_response, ai_internal_response,
  model, ai_drafted_at, public_response, internal_notes, drafted_at, edited_at, edited_by_id,
  approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
  resolution_action, latest_lifecycle_change_id, updated_at,
  uuid_extract_timestamp(id) AS created_at
`
