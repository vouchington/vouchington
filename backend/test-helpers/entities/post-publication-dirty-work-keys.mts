import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function listTestPostPublicationImpactRssFeedItemIds(
  dirtyWorkId: string,
): Promise<string[]> {
  const { rows } = await read<{ uuid_value: string }>(sql`
    /* listTestPostPublicationImpactRssFeedItemIds */
    SELECT uuid_value
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = ${dirtyWorkId} AND kind = 'impact_rss_feed_item'
    ORDER BY id
  `)
  return rows.map(row => row.uuid_value)
}
