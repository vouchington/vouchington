import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityActivityDigestCounts } from './community-activity-digest-body.mts'

export async function aggregateCommunityActivityDigestBatch(input: {
  recipientIds: string[]
  windowStart: Date
  windowEnd: Date
  windowStartId: string
  windowEndId: string
}): Promise<Array<CommunityActivityDigestCounts & { user_id: string }>> {
  const { rows } = await read<CommunityActivityDigestCounts & { user_id: string }>(sql`
    /* aggregateCommunityActivityDigestBatch */
    WITH eligible AS (
      SELECT cm.user_id, cm.community_id
      FROM community_members cm JOIN communities c ON c.id = cm.community_id
      JOIN users u ON u.id = cm.user_id
      WHERE cm.user_id = ANY(${input.recipientIds}::uuid[]) AND cm.removed_at IS NULL
        AND cm.role IN ('owner', 'moderator') AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND u.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM user_suspensions us WHERE us.user_id = cm.user_id AND us.lifted_at IS NULL)
        AND (NOT cm.suppress_community_digests_while_on_vacation OR NOT EXISTS (
          SELECT 1 FROM community_member_vacations v WHERE v.community_id = cm.community_id
            AND v.user_id = cm.user_id AND v.starts_at <= CURRENT_TIMESTAMP
            AND (v.ends_at IS NULL OR v.ends_at > CURRENT_TIMESTAMP)))
    ), community_ids AS (SELECT DISTINCT community_id FROM eligible),
    joins AS (
      SELECT cm.community_id, count(*)::int AS value FROM community_members cm
      JOIN users u ON u.id = cm.user_id JOIN community_ids c ON c.community_id = cm.community_id
      WHERE cm.id >= ${input.windowStartId} AND cm.id < ${input.windowEndId} AND u.deleted_at IS NULL
      GROUP BY cm.community_id
    ), departures AS (
      SELECT cm.community_id, count(*)::int AS value FROM community_members cm
      JOIN community_ids c ON c.community_id = cm.community_id
      WHERE cm.removed_at >= ${input.windowStart} AND cm.removed_at < ${input.windowEnd}
      GROUP BY cm.community_id
    ), post_activity AS (
      SELECT p.community_id,
        count(*) FILTER (WHERE p.post_type = 'discussion')::int AS discussions,
        count(*) FILTER (WHERE p.post_type = 'review')::int AS reviews,
        count(*) FILTER (WHERE p.post_type = 'data_point')::int AS data_points,
        count(*) FILTER (WHERE p.post_type = 'comment')::int AS comments,
        count(DISTINCT p.created_by_id)::int AS active_posters
      FROM posts p JOIN users u ON u.id = p.created_by_id
      JOIN community_ids c ON c.community_id = p.community_id
      WHERE p.id >= ${input.windowStartId} AND p.id < ${input.windowEndId}
        AND p.deleted_at IS NULL AND u.deleted_at IS NULL GROUP BY p.community_id
    ), active_members AS (
      SELECT cm.community_id, count(*)::int AS value FROM community_members cm JOIN users u ON u.id = cm.user_id
      JOIN community_ids c ON c.community_id = cm.community_id
      WHERE cm.removed_at IS NULL AND u.deleted_at IS NULL GROUP BY cm.community_id
    ), pending_reviews AS (
      SELECT r.community_id, count(*)::int AS pending
      FROM community_post_reviews r JOIN posts p ON p.id = r.post_id AND p.deleted_at IS NULL
      JOIN community_ids c ON c.community_id = r.community_id
      WHERE r.approved_at IS NULL AND r.rejected_at IS NULL GROUP BY r.community_id
    ), applications AS (
      SELECT a.community_id, count(*)::int AS pending FROM community_applications a
      JOIN community_ids c ON c.community_id = a.community_id
      WHERE a.approved_at IS NULL AND a.rejected_at IS NULL GROUP BY a.community_id
    ), reports AS (
      SELECT p.community_id, count(*)::int AS pending
      FROM moderation_reports r JOIN posts p ON p.id = r.post_id
      JOIN community_ids c ON c.community_id = p.community_id
      WHERE r.reviewed_at IS NULL GROUP BY p.community_id
    ), ban_evaders AS (
      SELECT cm.community_id, count(*)::int AS pending FROM community_members cm
      JOIN community_ids c ON c.community_id = cm.community_id WHERE cm.removed_at IS NULL
        AND cm.suspected_ban_evader_at IS NOT NULL AND cm.suspected_ban_evader_dismissed_at IS NULL GROUP BY cm.community_id
    ), top_ranked AS (
      SELECT p.community_id, concat(c.name, ': ', p.title, ' (', count(reply.id), ' replies)') AS label,
        count(reply.id)::int AS replies, row_number() OVER (PARTITION BY p.community_id ORDER BY count(reply.id) DESC, p.id ASC) AS rank
      FROM posts p JOIN communities c ON c.id = p.community_id JOIN community_ids ids ON ids.community_id = p.community_id
      LEFT JOIN posts reply ON reply.parent_id = p.id AND reply.post_type = 'comment'
        AND reply.id >= ${input.windowStartId} AND reply.id < ${input.windowEndId}
        AND reply.deleted_at IS NULL
      WHERE p.post_type = 'discussion' AND p.id < ${input.windowEndId} AND p.deleted_at IS NULL
      GROUP BY p.community_id, p.id, p.title, c.name
      HAVING count(reply.id) > 0
    ), activity AS (
      SELECT e.user_id, e.community_id, COALESCE(j.value,0) AS joins, COALESCE(d.value,0) AS departures,
        COALESCE(pa.discussions,0) AS discussions, COALESCE(pa.reviews,0) AS reviews,
        COALESCE(pa.data_points,0) AS data_points, COALESCE(pa.comments,0) AS comments,
        COALESCE(pa.active_posters,0) AS active_posters, COALESCE(am.value,0) AS active_members,
        COALESCE(pr.pending,0)+COALESCE(a.pending,0)+COALESCE(r.pending,0)+COALESCE(be.pending,0) AS moderation_workload,
        t.label AS top_discussion, COALESCE(t.replies,0) AS top_replies
      FROM eligible e LEFT JOIN joins j USING (community_id) LEFT JOIN departures d USING (community_id)
      LEFT JOIN post_activity pa USING (community_id) LEFT JOIN active_members am USING (community_id)
      LEFT JOIN pending_reviews pr USING (community_id) LEFT JOIN applications a USING (community_id)
      LEFT JOIN reports r USING (community_id) LEFT JOIN ban_evaders be USING (community_id)
      LEFT JOIN top_ranked t ON t.community_id=e.community_id AND t.rank=1
    ), active AS (SELECT * FROM activity WHERE joins+departures+discussions+reviews+data_points+comments+active_posters > 0)
    SELECT user_id, count(*)::int AS community_count, sum(joins)::int AS joins, sum(departures)::int AS departures,
      sum(discussions)::int AS discussions, sum(reviews)::int AS reviews, sum(data_points)::int AS data_points,
      sum(comments)::int AS comments, sum(active_posters)::int AS active_posters, sum(active_members)::int AS active_members,
      sum(moderation_workload)::int AS moderation_workload,
      (array_agg(top_discussion ORDER BY top_replies DESC) FILTER (WHERE top_discussion IS NOT NULL))[1] AS top_discussion
    FROM active GROUP BY user_id
  `)
  return rows
}
