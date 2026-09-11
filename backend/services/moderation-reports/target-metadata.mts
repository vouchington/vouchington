import sql, { type SQLStatement } from 'sql-template-strings'
import { reportTargetContentSql, reportTargetLabelSql } from './target-content.mts'

export type { ModerationReportTargetContent } from './target-content.mts'

export type ModerationReportStatusSqlAlias = 'mr' | 'r' | 'rc' | 'rr'

export function appendReportTargetColumns(query: SQLStatement, { includeAvailable = false } = {}) {
  query.append(sql`
      `)
  query.append(reportTargetLabelSql())
  query.append(sql` AS target_label,
      `)
  query.append(reportTargetContentSql())
  query.append(sql` AS target_content,
      `)
  query.append(reportTargetPathSql())
  query.append(sql` AS target_path,
      `)
  query.append(reportAdminActionPathSql())
  query.append(sql` AS admin_action_path,
      `)
  query.append(reportTargetUserIdSql())
  query.append(sql` AS target_user_id`)
  if (includeAvailable) {
    query.append(sql`,
      `)
    query.append(reportTargetAvailableSql())
    query.append(sql` AS target_available`)
  }
}

export function reportTargetJoinsSql() {
  return sql`
    LEFT JOIN users target_user ON r.reported_user_id IS NOT NULL AND target_user.id = r.reported_user_id
    LEFT JOIN posts target_post ON r.post_id IS NOT NULL AND target_post.id = r.post_id
    LEFT JOIN LATERAL (
      SELECT slug
      FROM post_slugs
      WHERE post_id = target_post.id
      ORDER BY created_at DESC
      LIMIT 1
    ) target_post_slug ON true
    LEFT JOIN posts root_post ON r.post_id IS NOT NULL AND target_post.post_type = 'comment' AND root_post.id = target_post.root_id
    LEFT JOIN LATERAL (
      SELECT slug
      FROM post_slugs
      WHERE post_id = root_post.id
      ORDER BY created_at DESC
      LIMIT 1
    ) root_post_slug ON true
    LEFT JOIN url_hostnames target_hostname
      ON r.hostname_id IS NOT NULL AND target_hostname.id = r.hostname_id
    LEFT JOIN rss_feed_items target_rss_item
      ON r.rss_feed_item_id IS NOT NULL AND target_rss_item.id = r.rss_feed_item_id
  `
}

export function moderationReportsWithEntitySql(): SQLStatement {
  const statement = sql`(
    SELECT
      mr.*,
      `
  statement.append(moderationReportStatusSql('mr'))
  statement.append(sql` AS status,
      COALESCE(mr.post_id, mr.reported_user_id, mr.hostname_id, mr.rss_feed_item_id) AS entity_id,
      CASE
        WHEN mr.post_id IS NOT NULL AND mrp.post_type = 'comment' THEN 'comment'
        WHEN mr.post_id IS NOT NULL THEN 'post'
        WHEN mr.reported_user_id IS NOT NULL THEN 'user'
        WHEN mr.hostname_id IS NOT NULL THEN 'url_hostname'
        WHEN mr.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
      END::moderation_report_entity_type AS entity_type
    FROM moderation_reports mr
    LEFT JOIN posts mrp ON mr.post_id IS NOT NULL AND mrp.id = mr.post_id
  )`)
  return statement
}

export function moderationReportStatusSql(alias: ModerationReportStatusSqlAlias): SQLStatement {
  return sql``.append(
    `CASE WHEN ${alias}.reviewed_at IS NULL THEN 'pending' ELSE ${alias}.resolution_action::text END`,
  )
}

export function reportTargetAvailableSql() {
  return sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN target_user.id IS NOT NULL AND target_user.deleted_at IS NULL
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN target_post.id IS NOT NULL AND target_post.deleted_at IS NULL
    WHEN r.post_id IS NOT NULL THEN target_post.id IS NOT NULL AND target_post.deleted_at IS NULL
    WHEN r.hostname_id IS NOT NULL THEN target_hostname.id IS NOT NULL
    WHEN r.rss_feed_item_id IS NOT NULL THEN target_rss_item.id IS NOT NULL AND target_rss_item.deleted_at IS NULL
    ELSE false
  END`
}

export function communityPostNotApprovedSql(postAlias: 'target_post' | 'root_post') {
  return sql``.append(`(${postAlias}.community_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM community_post_reviews cpr_vis
      WHERE cpr_vis.community_id = ${postAlias}.community_id
        AND cpr_vis.post_id = ${postAlias}.id
        AND cpr_vis.approved_at IS NOT NULL
        AND cpr_vis.rejected_at IS NULL
        AND cpr_vis.unpublished_at IS NULL
    ))`)
}

/**
 * True when the target is a non-public (followers-only/private) post/comment, or belongs
 * to a private community, or belongs to a community but is not yet approved — used to mask
 * target metadata, judgement, and moderation context from non-staff viewers on the GLOBAL
 * reports queue. (The per-community queue intentionally omits the private-community clause,
 * since members may see their own community's content.)
 * Requires the joins from `reportTargetJoinsSql()` (target_post, root_post).
 */
export function reportTargetIsRestrictedSql() {
  const stmt = sql`CASE
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN (
      root_post.broadcast <> 'everyone' OR root_post.privacy <> 'public'
      OR EXISTS(SELECT 1 FROM communities c WHERE c.id = root_post.community_id AND c.visibility = 'private')
      OR `
  stmt.append(communityPostNotApprovedSql('root_post'))
  stmt.append(sql`
    )
    WHEN r.post_id IS NOT NULL THEN (
      target_post.broadcast <> 'everyone' OR target_post.privacy <> 'public'
      OR EXISTS(SELECT 1 FROM communities c WHERE c.id = target_post.community_id AND c.visibility = 'private')
      OR `)
  stmt.append(communityPostNotApprovedSql('target_post'))
  stmt.append(sql`
    )
    ELSE false
  END`)
  return stmt
}

function reportTargetPathSql() {
  const statement = sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN
      '/user/' || COALESCE(target_user.username, target_user.id::text)
    WHEN r.hostname_id IS NOT NULL THEN
      '/domain/' || target_hostname.hostname
    WHEN r.post_id IS NOT NULL AND target_post.post_type = 'comment' THEN
      '/' ||
      `
  statement.append(postTypePathSegmentSql('root_post.post_type'))
  statement.append(sql` ||
      '/' || COALESCE(root_post_slug.slug, root_post.id::text, target_post.id::text) ||
      '/comment/' || target_post.id::text
    WHEN r.post_id IS NOT NULL THEN
      '/' ||
      `)
  statement.append(postTypePathSegmentSql('target_post.post_type'))
  statement.append(sql` ||
      '/' || COALESCE(target_post_slug.slug, target_post.id::text)
    ELSE NULL
  END`)
  return statement
}

function reportAdminActionPathSql() {
  const statement = sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN
      '/user/' || COALESCE(target_user.username, target_user.id::text) || '/admin'
    WHEN r.hostname_id IS NOT NULL THEN
      '/domain/' || target_hostname.hostname
    WHEN r.post_id IS NOT NULL THEN
      `
  statement.append(reportTargetPathSql())
  statement.append(sql`
    ELSE NULL
  END`)
  return statement
}

function reportTargetUserIdSql() {
  return sql`CASE
    WHEN r.reported_user_id IS NOT NULL THEN r.reported_user_id
    WHEN r.post_id IS NOT NULL THEN target_post.created_by_id
    ELSE NULL
  END`
}

function postTypePathSegmentSql(expression: string) {
  return sql`CASE `.append(expression).append(sql`
      WHEN 'story' THEN 'story'
      WHEN 'review' THEN 'review'
      WHEN 'article' THEN 'article'
      WHEN 'blog_post' THEN 'blog-post'
      WHEN 'data_point' THEN 'data-point'
      ELSE 'discussion'
    END`)
}
