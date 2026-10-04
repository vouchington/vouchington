import { recordModeratorAction } from '@services/moderator-actions'
import { crawlerHistorySnapshot } from './history.mts'
import type { PrivateUser } from '@services/users/types'
import { beginTransaction, write } from '@data-stores/psql'
import { getCrawlerById } from './get.mts'
import sql from 'sql-template-strings'

export const deleteCrawler = async (deleter: PrivateUser, crawlerId: string): Promise<void> => {
  await using query = await beginTransaction()

  await query(
    sql`/* deleteCrawler:lock */ SELECT id FROM hostname_crawler_configurations WHERE id = ${crawlerId} AND deleted_at IS NULL FOR UPDATE`,
  )

  // Check if crawler exists and is not already deleted
  const crawler = await getCrawlerById(crawlerId, { query })
  if (!crawler || crawler.deleted_at) {
    await query.commit()
    return
  }
  // Soft delete the crawler
  await write(
    sql`/* deleteCrawler */
      UPDATE hostname_crawler_configurations
      SET deleted_at = NOW(), deleted_by_id = ${deleter.id}
      WHERE id = ${crawlerId}
        AND deleted_at IS NULL
    `,
    { query },
  )

  await recordModeratorAction(
    deleter.id,
    {
      actionType: 'crawler_delete',
      crawlerId,
      metadata: { before: crawlerHistorySnapshot(crawler), after: { deleted: true } },
    },
    { query },
  )
  await query.commit()
}
