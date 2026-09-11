import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRssFeedFollowCount(rssFeedId: string): Promise<number> {
  const { rows } = await read(sql`/* getRssFeedFollowCount */
    SELECT COUNT(*)::int AS count
    FROM relation__user__follow__rss_feed
    WHERE object_id = ${rssFeedId}
      AND deleted_at IS NULL
  `)
  return Number(rows[0]?.count ?? 0)
}
