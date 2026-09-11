import sql from 'sql-template-strings'

export const APPEAL_SELECT = sql`
  ma.id, ma.case_id, ma.appellant_id, ma.user_warning_id, ma.community_ban_id, ma.post_id, ma.user_suspension_id, ma.community_id, ma.post_removal_kind,
  ma.appeal_reason,
  CASE
    WHEN ma.resolved_at IS NULL THEN 'pending'
    WHEN ma.resolution_action = 'deny' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  ma.recommended_action, ma.ai_public_response, ma.ai_internal_response,
  ma.model, ma.ai_drafted_at, ma.public_response, ma.internal_notes, ma.drafted_at, ma.edited_at, ma.edited_by_id,
  ma.approved_at, ma.approved_by_id, ma.sent_at, ma.resolved_at, ma.resolved_by_id,
  ma.resolution_action, ma.latest_lifecycle_change_id, ma.updated_at,
  uuid_extract_timestamp(ma.id) AS created_at,
  CASE
    WHEN uw.id IS NOT NULL THEN jsonb_build_object(
      'type', 'warning',
      'id', uw.id,
      'public_message', uw.public_message,
      'created_at', uw.created_at,
      'community', CASE WHEN wc.id IS NULL THEN NULL ELSE jsonb_build_object('id', wc.id, 'name', wc.name) END
    )
    WHEN cb.id IS NOT NULL AND bc.id IS NOT NULL THEN jsonb_build_object(
      'type', 'community_ban',
      'id', cb.id,
      'reason', cb.reason,
      'expires_at', cb.expires_at,
      'created_at', cb.created_at,
      'community', jsonb_build_object('id', bc.id, 'name', bc.name)
    )
    WHEN us.id IS NOT NULL THEN jsonb_build_object(
      'type', 'suspension',
      'id', us.id,
      'reason', us.reason,
      'created_at', us.created_at
    )
    WHEN p.id IS NOT NULL AND ma.post_removal_kind IS NOT NULL THEN jsonb_build_object(
      'type', 'post_removal',
      'id', p.id,
      'kind', ma.post_removal_kind,
      'title', p.title,
      'declared_language', p.declared_language,
      'lingua_rs_detected_language', p.lingua_rs_detected_language,
      'decided_at', CASE
        WHEN create_change.metadata ? 'original_decision'
          THEN (create_change.metadata #>> '{original_decision,decided_at}')::timestamptz
        WHEN ma.post_removal_kind = 'community' THEN cpr.unpublished_at
        ELSE pcs.clearance_updated_at
      END,
      'public_reason', CASE
        WHEN ma.post_removal_kind = 'community'
          AND create_change.metadata ? 'original_decision'
          THEN create_change.metadata #>> '{original_decision,reason}'
        WHEN ma.post_removal_kind = 'community' THEN cpr.rejection_reason
        ELSE NULL
      END,
      'community', CASE WHEN pc.id IS NULL THEN NULL ELSE jsonb_build_object('id', pc.id, 'name', pc.name) END
    )
    ELSE NULL
  END AS target_context,
  jsonb_build_object(
    'appellant', jsonb_build_object(
      'id', ma.appellant_id,
      'username', appellant.username,
      'verified_display_name', appellant.verified_display_name,
      'profile_image_id', appellant.profile_image_id
    ),
    'original_decision', jsonb_build_object(
      'internal_reason', CASE
        WHEN create_change.metadata ? 'original_decision'
          THEN create_change.metadata #>> '{original_decision,reason}'
        ELSE CASE
          WHEN ma.user_warning_id IS NOT NULL THEN uw.reason
          WHEN ma.community_ban_id IS NOT NULL THEN cb.reason
          WHEN ma.user_suspension_id IS NOT NULL THEN us.reason
          WHEN ma.post_removal_kind = 'community' THEN cpr.rejection_reason
          WHEN ma.post_removal_kind = 'platform' THEN pcs.clearance_reason
          ELSE NULL
        END
      END,
      'actor', CASE
        WHEN decision_actor_ref.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', decision_actor_ref.id,
          'username', decision_actor.username,
          'verified_display_name', decision_actor.verified_display_name,
          'profile_image_id', decision_actor.profile_image_id
        )
      END
    )
  ) AS staff_context
`

export const APPEAL_JOINS = sql`
  LEFT JOIN view_users_public appellant ON appellant.id = ma.appellant_id
  LEFT JOIN user_warnings uw ON uw.id = ma.user_warning_id
  LEFT JOIN communities wc ON wc.id = uw.community_id
  LEFT JOIN community_bans cb ON cb.id = ma.community_ban_id
  LEFT JOIN communities bc ON bc.id = cb.community_id
  LEFT JOIN user_suspensions us ON us.id = ma.user_suspension_id
  LEFT JOIN posts p ON p.id = ma.post_id
  LEFT JOIN view_post_clearance_status pcs ON pcs.post_id = ma.post_id
  LEFT JOIN post_clearance_changes pcc ON pcc.id = pcs.latest_clearance_change_id
  LEFT JOIN community_post_reviews cpr
    ON cpr.post_id = ma.post_id AND cpr.community_id = ma.community_id
  LEFT JOIN communities pc ON pc.id = ma.community_id
  LEFT JOIN moderation_appeal_lifecycle_changes create_change
    ON create_change.moderation_appeal_id = ma.id AND create_change.change_type = 'create'
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN create_change.metadata ? 'original_decision'
        THEN (create_change.metadata #>> '{original_decision,actor_id}')::uuid
      ELSE CASE
        WHEN ma.user_warning_id IS NOT NULL THEN uw.issued_by_id
        WHEN ma.community_ban_id IS NOT NULL THEN cb.banned_by_id
        WHEN ma.user_suspension_id IS NOT NULL THEN us.suspended_by_id
        WHEN ma.post_removal_kind = 'community' THEN cpr.unpublished_by_id
        WHEN ma.post_removal_kind = 'platform' THEN pcc.changed_by_id
        ELSE NULL
      END
    END AS id
  ) decision_actor_ref ON true
  LEFT JOIN view_users_public decision_actor ON decision_actor.id = decision_actor_ref.id
`
