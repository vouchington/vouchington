import sql, { type SQLStatement } from 'sql-template-strings'

type CommunityPostQueueSource = 'community_review' | 'automod_flag'

/** Closed set, so these fragments are never user input. */
const POST_QUEUE_SOURCES: Record<CommunityPostQueueSource, { comment: string; createdAt: string }> =
  {
    community_review: { comment: 'reviews', createdAt: 'cpr.created_at' },
    automod_flag: { comment: 'automod_flags', createdAt: 'cpr.automod_flagged_at' },
  }

/** Pre-publication reviews: posts still waiting for a first moderator decision. */
export function buildCommunityReviewQueueQuery(communityId: string) {
  return buildCommunityPostQueueQuery(
    'community_review',
    sql`
    WHERE cpr.community_id = ${communityId}
      AND cpr.approved_at IS NULL
      AND cpr.rejected_at IS NULL
      AND rp.deleted_at IS NULL
  `,
  )
}

/**
 * Open automod flags. A flag is current only while the post is still published and the digest it
 * was computed for is the post's current one, so an edit retires it without any write.
 */
export function buildCommunityAutomodFlagQueueQuery(communityId: string) {
  return buildCommunityPostQueueQuery(
    'automod_flag',
    sql`
    WHERE cpr.community_id = ${communityId}
      AND cpr.automod_action = 'review_queue'
      AND cpr.automod_dismissed_at IS NULL
      AND cpr.automod_flagged_content_sha256 = rp.llm_moderation_content_sha256
      AND cpr.approved_at IS NOT NULL
      AND cpr.rejected_at IS NULL
      AND cpr.unpublished_at IS NULL
      AND rp.deleted_at IS NULL
  `,
  )
}

function buildCommunityPostQueueQuery(source: CommunityPostQueueSource, where: SQLStatement) {
  const { comment, createdAt } = POST_QUEUE_SOURCES[source]
  const postPath = `'/' || CASE rp.post_type
        WHEN 'story' THEN 'story'
        WHEN 'review' THEN 'review'
        WHEN 'article' THEN 'article'
        WHEN 'blog_post' THEN 'blog-post'
        WHEN 'data_point' THEN 'data-point'
        ELSE 'discussion'
      END || '/' || COALESCE(ps.slug, rp.id::text)`
  const query = sql``
  query.append(`/* searchCommunityModerationQueue:${comment} */
    SELECT
      cpr.post_id AS id,
      ${createdAt} AS created_at,
      to_char(
        ${createdAt} AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_created_at,
      NULL::timestamptz AS reviewed_at,
      NULL::uuid AS reporter_user_id,
      NULL::text AS reporter_username,
      'post'::moderation_report_entity_type AS entity_type,
      cpr.post_id AS entity_id,
      COALESCE(NULLIF(BTRIM(rp.title), ''), 'Post ' || rp.id::text) AS target_label,
      CASE WHEN NULLIF(BTRIM(rp.title), '') IS NOT NULL THEN jsonb_build_object(
        'kind', 'post',
        'text', rp.title,
        'declared_language', rp.declared_language,
        'lingua_rs_detected_language', rp.lingua_rs_detected_language
      ) ELSE NULL END AS target_content,
      ${postPath} AS target_path,
      ${postPath} AS admin_action_path,
      rp.created_by_id AS target_user_id,
      (rp.id IS NOT NULL AND rp.deleted_at IS NULL) AS target_available,
      NULL::moderation_report_reason AS reason,
      NULL::text AS note,
      'pending'::text AS status,
      NULL::uuid AS resolved_by_id,
      0::integer AS report_count,
      0::integer AS cursor_report_count,
      0::integer AS cursor_severity_rank,
      (rp.broadcast <> 'everyone' OR rp.privacy <> 'public') AS target_is_restricted,
      rp.is_anonymous AS target_is_anonymous,
      '${source}'::text AS queue_source
    FROM community_post_reviews cpr
    JOIN posts rp ON rp.id = cpr.post_id
    LEFT JOIN LATERAL (
      SELECT slug FROM post_slugs
      WHERE post_id = rp.id
      ORDER BY created_at DESC
      LIMIT 1
    ) ps ON true
  `)
  return query.append(where)
}
