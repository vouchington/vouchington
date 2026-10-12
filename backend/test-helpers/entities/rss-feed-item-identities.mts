import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function getTestRssFeedItemIdentityTransactionId(itemId: string): Promise<string> {
  const { rows } = await write<{
    transaction_id: string
  }>(sql`/* getTestRssFeedItemIdentityTransactionId */
    SELECT xmin::text AS transaction_id
    FROM rss_feed_item_guids
    WHERE id = ${itemId}
  `)
  if (!rows[0]) throw new Error(`RSS feed item identity not found: ${itemId}`)
  return rows[0].transaction_id
}
