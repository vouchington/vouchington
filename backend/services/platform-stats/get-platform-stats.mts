import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PlatformStats } from './types.mts'

export async function getPlatformStats(): Promise<PlatformStats> {
  const query = sql`/* getPlatformStats */
    SELECT topic_count, rss_feed_count, post_count, review_count, data_point_count, hostname_count
    FROM mv_platform_stats
    WHERE singleton_id = 1
  `

  const { rows } = await read<PlatformStats>(query)
  return rows[0]
}
