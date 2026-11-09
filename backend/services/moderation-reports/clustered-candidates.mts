import sql from 'sql-template-strings'

/** Indexed cluster projection with the target's current post/comment classification. */
export function moderationReportClusterCandidatesSql(sortAsc: boolean) {
  const query = sql`(
    SELECT cluster.post_id, cluster.reported_user_id, cluster.hostname_id,
      cluster.rss_feed_item_id, cluster.resolution_action,
      cluster.first_reported_at, cluster.last_reported_at,
      `
  query.append(sortAsc ? sql`cluster.first_reported_at` : sql`cluster.last_reported_at`)
  query.append(sql` AS sort_reported_at,
      COALESCE(cluster.post_id, cluster.reported_user_id, cluster.hostname_id,
        cluster.rss_feed_item_id) AS entity_id,
      CASE
        WHEN cluster.post_id IS NOT NULL AND (
          SELECT target_post.post_type FROM posts target_post WHERE target_post.id = cluster.post_id
        ) = 'comment' THEN 'comment'
        WHEN cluster.post_id IS NOT NULL THEN 'post'
        WHEN cluster.reported_user_id IS NOT NULL THEN 'user'
        WHEN cluster.hostname_id IS NOT NULL THEN 'url_hostname'
        ELSE 'rss_feed_item'
      END::moderation_report_entity_types AS entity_type
    FROM moderation_report_clusters cluster
  )`)
  return query
}
