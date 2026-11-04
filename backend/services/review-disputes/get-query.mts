import sql from 'sql-template-strings'

export const DISPUTE_SELECT = sql`
  rd.id, rd.post_id, rd.topic_id, rd.disputant_user_id, rd.reason, rd.claim_text,
  CASE
    WHEN rd.resolved_at IS NULL THEN 'pending'
    WHEN rd.resolution_action = 'dismiss' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  rd.recommended_action, rd.ai_public_response, rd.ai_internal_response, rd.model, rd.ai_drafted_at,
  rd.ai_draft_run_id,
  ('dispute_resolution_' || rd.ai_draft_request_token::text) AS ai_draft_requested_run_id,
  rd.public_response, rd.internal_notes, rd.drafted_at, rd.edited_at, rd.edited_by_id,
  rd.approved_at, rd.approved_by_id, rd.sent_at, rd.resolved_at, rd.resolved_by_id,
  rd.resolution_action, rd.latest_lifecycle_change_id, rd.updated_at,
  uuid_extract_timestamp(rd.id) AS created_at,
  CASE WHEN p.deleted_at IS NULL THEN
    COALESCE(NULLIF(BTRIM(p.title), ''), post_slug.slug, NULLIF(BTRIM(LEFT(p.markdown, 80)), ''), p.post_type::text)
  ELSE p.post_type::text END AS post_label,
  CASE WHEN p.deleted_at IS NULL AND NULLIF(BTRIM(p.title), '') IS NOT NULL THEN jsonb_build_object(
    'text', p.title,
    'declared_language', p.declared_language,
    'lingua_rs_detected_language', p.lingua_rs_detected_language
  ) ELSE NULL END AS post_content,
  jsonb_build_object(
    'disputant', jsonb_build_object(
      'id', rd.disputant_user_id,
      'username', disputant.username,
      'verified_display_name', disputant.verified_display_name,
      'profile_image_id', disputant.profile_image_id
    ),
    'review', jsonb_build_object(
      'post', jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'declared_language', p.declared_language,
        'lingua_rs_detected_language', p.lingua_rs_detected_language,
        'slug', post_slug.slug,
        'markdown_preview', LEFT(p.markdown, 500),
        'created_by_id', p.created_by_id,
        'created_at', p.created_at
      ),
      'topic', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'slug', t.slug,
        'topic_type', t.topic_type
      ) END,
      'rating', rd.disputed_rating
    )
  ) AS staff_context
`

export const DISPUTE_JOINS = sql`
  LEFT JOIN view_users_public disputant ON disputant.id = rd.disputant_user_id
  JOIN posts p ON p.id = rd.post_id
  LEFT JOIN topics t
    ON t.id = rd.topic_id
    AND t.deleted_at IS NULL
    AND t.merged_into_topic_id IS NULL
  LEFT JOIN LATERAL (
    SELECT ps.slug
    FROM post_slugs ps
    WHERE ps.post_id = rd.post_id
    ORDER BY ps.id DESC
    LIMIT 1
  ) post_slug ON true
`

/**
 * List rows are summaries. Drafts, unsent responses, internal notes, the claim and the review
 * context load from the detail read when a row is opened. A response is public only once sent.
 */
export const DISPUTE_SUMMARY_SELECT = sql`
  rd.id, rd.post_id, rd.topic_id, rd.disputant_user_id, rd.reason,
  CASE
    WHEN rd.resolved_at IS NULL THEN 'pending'
    WHEN rd.resolution_action = 'dismiss' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  rd.recommended_action,
  CASE WHEN rd.sent_at IS NOT NULL THEN rd.public_response END AS public_response,
  (rd.ai_drafted_at IS NOT NULL) AS has_ai_draft,
  (rd.public_response IS NOT NULL) AS has_draft,
  rd.approved_at, rd.sent_at, rd.resolved_at, rd.resolution_action, rd.updated_at,
  uuid_extract_timestamp(rd.id) AS created_at,
  CASE WHEN p.deleted_at IS NULL THEN
    COALESCE(NULLIF(BTRIM(p.title), ''), post_slug.slug, NULLIF(BTRIM(LEFT(p.markdown, 80)), ''), p.post_type::text)
  ELSE p.post_type::text END AS post_label,
  CASE WHEN p.deleted_at IS NULL AND NULLIF(BTRIM(p.title), '') IS NOT NULL THEN jsonb_build_object(
    'text', p.title,
    'declared_language', p.declared_language,
    'lingua_rs_detected_language', p.lingua_rs_detected_language
  ) ELSE NULL END AS post_content,
  post_slug.slug AS post_slug,
  jsonb_build_object(
    'id', rd.disputant_user_id,
    'username', disputant.username,
    'verified_display_name', disputant.verified_display_name,
    'profile_image_id', disputant.profile_image_id
  ) AS disputant
`

export const DISPUTE_SUMMARY_JOINS = sql`
  LEFT JOIN view_users_public disputant ON disputant.id = rd.disputant_user_id
  JOIN posts p ON p.id = rd.post_id
  LEFT JOIN LATERAL (
    SELECT ps.slug
    FROM post_slugs ps
    WHERE ps.post_id = rd.post_id
    ORDER BY ps.id DESC
    LIMIT 1
  ) post_slug ON true
`
