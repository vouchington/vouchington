import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkCrawlHostname } from '@queues/crawl-hostnames/enqueues'

const BATCH_SIZE = Number.parseInt(process.env.CRAWLER_BATCH_SIZE || '', 10) || 1000

/**
 * Daily job that dispatches crawl jobs for all crawlable hostnames.
 * For each hostname, it enqueues a job to dispatch URLs for that hostname.
 */
export const dispatchCrawlHostnames = async (): Promise<number> => {
  const statement = sql`/* dispatchCrawlHostnames */
    SELECT id
    FROM url_hostnames uh
    WHERE uh.crawlable = true
      AND uh.blocked = false
      AND NOT EXISTS (
        SELECT 1 FROM domain_blacklists db
        JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
        WHERE db.domain = uh.hostname AND dbs.type = 'url'::domain_blacklist_types
      )
    ORDER BY uh.id ASC
  `
  let total = 0

  await executeHandlerWithCursorInBatches<{ id: string }>(statement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      const ids = rows.map(row => row.id)
      total += ids.length
      await enqueueBulkCrawlHostname(ids)
    },
  })

  return total
}
