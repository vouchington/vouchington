import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { itemHasDiscoverableSourceSql } from '@services/rss-feeds/discoverability-sql'

export type ClusterItemRow = {
  id: string
  published_at: Date
  story_id: string | null
  story_locked_at: Date | null
  deleted_at: Date | null
  has_embedding: boolean
  is_cluster_eligible: boolean
}

export async function fetchClusterItem(
  rss_feed_item_id: string,
  options: QueryOptions = {},
): Promise<ClusterItemRow | null> {
  const clusterEligibleSql = itemHasDiscoverableSourceSql('rfi.id')

  const query = sql`/* clusterRssFeedItem */
    SELECT
      rfi.id,
      rfi.published_at,
      rfi.story_id,
      rfi.story_locked_at,
      rfi.deleted_at,
      (rfi.bedrock_nova_multimodal_v1_embedding IS NOT NULL) AS has_embedding,
      (`

  query.append(clusterEligibleSql)
  query.append(sql`) AS is_cluster_eligible
    FROM rss_feed_items rfi
    WHERE rfi.id = ${rss_feed_item_id}
    LIMIT 1
  `)

  const { rows } = await read(query, options)
  return (rows[0] as ClusterItemRow) ?? null
}
