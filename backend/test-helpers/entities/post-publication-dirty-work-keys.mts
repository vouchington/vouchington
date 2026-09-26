import { retainedKeyPayloadSql } from '../../services/post-publication/concrete-key-columns.mts'
import { read } from '@data-stores/psql'

export async function listTestPostPublicationImpactRssFeedItemIds(
  dirtyWorkId: string,
): Promise<string[]> {
  const { rows } = await read<{ uuid_value: string }>(
    `
    /* listTestPostPublicationImpactRssFeedItemIds */
    SELECT uuid_value
    FROM (SELECT key.id, key.dirty_work_id, ${retainedKeyPayloadSql()} FROM post_publication_dirty_work_keys key) concrete_keys
    WHERE dirty_work_id = $1 AND kind = 'impact_rss_feed_item'
    ORDER BY id
  `,
    [dirtyWorkId],
  )
  return rows.map(row => row.uuid_value)
}
