import sql from 'sql-template-strings'

export type ModerationReportTargetContent = {
  kind: 'post' | 'comment'
  text: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

export function reportTargetLabelSql() {
  return sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(target_user_profile.verified_display_name), ''), target_user_profile.username, r.entity_type::text)
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN COALESCE(NULLIF(BTRIM(root_post.title), ''), NULLIF(BTRIM(LEFT(target_post.markdown, 80)), ''), r.entity_type::text)
    WHEN r.post_id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(target_post.title), ''), target_post_slug.slug, NULLIF(BTRIM(LEFT(target_post.markdown, 80)), ''), r.entity_type::text)
    WHEN r.hostname_id IS NOT NULL THEN COALESCE(target_hostname.hostname, r.entity_type::text)
    WHEN r.rss_feed_item_id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(target_rss_item.data->>'title'), ''), NULLIF(BTRIM(target_rss_item.data->>'url'), ''), r.entity_type::text)
    ELSE r.entity_type::text
  END`
}

export function reportTargetContentSql() {
  return sql`CASE
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' AND NULLIF(BTRIM(root_post.title), '') IS NOT NULL
      THEN jsonb_build_object(
        'kind', 'comment',
        'text', root_post.title,
        'declared_language', root_post.declared_language,
        'lingua_rs_detected_language', root_post.lingua_rs_detected_language
      )
    WHEN r.post_id IS NOT NULL AND NULLIF(BTRIM(target_post.title), '') IS NOT NULL
      THEN jsonb_build_object(
        'kind', 'post',
        'text', target_post.title,
        'declared_language', target_post.declared_language,
        'lingua_rs_detected_language', target_post.lingua_rs_detected_language
      )
    ELSE NULL
  END`
}
