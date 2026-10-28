import type { TransactionQuery } from '@data-stores/psql'

// Each source scan is selected through its topic FK index, then every collision lookup is
// performed only for that materialized page. No outer LIMIT over an unbounded UNION.
const probes = [
  {
    table: 'user_referral_program_links',
    column: 'referral_program_topic_id',
    key: 'id',
    live: 's.deleted_at IS NULL',
    collision: 'd.user_id = s.user_id AND d.url_id = s.url_id AND d.deleted_at IS NULL',
  },
  {
    table: 'individual_rewards_program_point_valuations',
    column: 'rewards_program_topic_id',
    key: 'individual_id',
    collision: 'd.individual_id = s.individual_id',
  },
  {
    table: 'retailer_countries',
    column: 'retailer_topic_id',
    key: 'country_id',
    collision: 'd.country_id = s.country_id',
  },
  {
    table: 'referral_program_topic_link_validation_rule_sets',
    column: 'referral_program_topic_id',
    key: 'referral_program_link_validation_rule_set_id',
    collision:
      'd.referral_program_link_validation_rule_set_id = s.referral_program_link_validation_rule_set_id',
  },
] as const

export const topicMergeCompatibilityProbeCount = probes.length + 1

export async function processTopicMergeCompatibilityPage(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
  position: number,
  cursor: string | null,
  limit: number,
): Promise<{ hasMore: boolean; cursor: string | null; errorCode: string | null }> {
  if (position === 0) {
    const { rows } = await query<{ error_code: string | null }>(
      `/* processTopicMergeCompatibilityPage identities */ SELECT CASE
        WHEN s.topic_type <> d.topic_type THEN 'topic_merge_type_conflict'
        -- no-mistakes-disable-next-line postgres-required-predicates: this conflict probe deliberately selects retained inbound redirects.
        WHEN EXISTS (SELECT 1 FROM topics WHERE merged_into_topic_id = s.id AND deleted_at IS NULL LIMIT 1) THEN 'topic_merge_inbound_alias_conflict'
        WHEN EXISTS (SELECT 1 FROM topic_aliases WHERE alias = s.slug AND topic_id IS NOT NULL AND topic_id <> ALL(ARRAY[s.id,d.id]) LIMIT 1) THEN 'topic_merge_alias_conflict'
        WHEN EXISTS (SELECT 1 FROM rss_feeds WHERE topic_id = s.id AND deleted_at IS NULL LIMIT 1)
          AND EXISTS (SELECT 1 FROM rss_feeds WHERE topic_id = d.id AND deleted_at IS NULL LIMIT 1) THEN 'topic_merge_feed_conflict'
        WHEN EXISTS (SELECT 1 FROM rewards_program_status_topics a
          JOIN rewards_program_status_topics b ON b.lifetime_version_id = d.id
          WHERE a.lifetime_version_id = s.id AND a.topic_id <> s.id LIMIT 1)
          OR EXISTS (SELECT 1 FROM rewards_program_status_topics WHERE topic_id = d.id AND lifetime_version_id = s.id)
          OR EXISTS (SELECT 1 FROM rewards_program_status_topics status JOIN topics owner ON owner.id = status.topic_id
            WHERE status.lifetime_version_id = s.id AND status.topic_id <> s.id
              AND owner.deleted_at IS NULL AND owner.merged_into_topic_id IS NULL
              AND owner.rewards_program_topic_id IS DISTINCT FROM d.rewards_program_topic_id LIMIT 1)
          THEN 'topic_merge_lifetime_version_conflict'
        ELSE NULL END AS error_code FROM topics s JOIN topics d ON d.id = $2::uuid
        WHERE s.id = $1::uuid AND s.deleted_at IS NULL AND s.merged_into_topic_id IS NULL
          AND d.deleted_at IS NULL AND d.merged_into_topic_id IS NULL`,
      [sourceId, destinationId],
    )
    return { hasMore: false, cursor: null, errorCode: rows[0]!.error_code }
  }
  const probe = probes[position - 1]
  if (!probe) return { hasMore: false, cursor, errorCode: null }
  const live = 'live' in probe ? `AND ${probe.live}` : ''
  const { rows } = await query<{ key: string; conflict: boolean }>(
    `/* processTopicMergeCompatibilityPage references */ WITH page AS MATERIALIZED (
      SELECT * FROM ${probe.table} s WHERE s.${probe.column} = $1::uuid
        AND ($3::text IS NULL OR s.${probe.key} > $3::${probe.table === 'retailer_countries' ? 'smallint' : 'uuid'})
      ORDER BY s.${probe.key} LIMIT $4
    ) SELECT s.${probe.key} AS key, EXISTS(SELECT 1 FROM ${probe.table} d
      WHERE d.${probe.column} = $2::uuid AND ${probe.collision} ${live}) AS conflict
      FROM page s ORDER BY s.${probe.key}`,
    [sourceId, destinationId, cursor, limit],
  )
  return {
    hasMore: rows.length === limit,
    cursor: rows.at(-1)?.key ?? cursor,
    errorCode: rows.some(row => row.conflict) ? 'topic_merge_reference_conflict' : null,
  }
}
