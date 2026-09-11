import sql from 'sql-template-strings'

export type ModerationReportTargetContent = {
  kind: 'post' | 'comment'
  text: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

export function reportTargetLabelSql() {
  return sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN COALESCE('@' || target_user.username, 'User ' || target_user.id::text)
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN COALESCE('Comment on ' || NULLIF(BTRIM(root_post.title), ''), 'Comment ' || target_post.id::text)
    WHEN r.post_id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(target_post.title), ''), 'Post ' || target_post.id::text)
    WHEN r.hostname_id IS NOT NULL THEN target_hostname.hostname
    WHEN r.rss_feed_item_id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(target_rss_item.data->>'title'), ''), 'RSS item ' || target_rss_item.id::text)
    ELSE NULL
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
