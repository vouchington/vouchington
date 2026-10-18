import assert from 'node:assert/strict'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { read } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { hardDeleteRssFeedById } from '@services/rss-feeds/delete'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import sql from 'sql-template-strings'
import { checkTieredContract } from './rss-crawl-tier-contract.mts'

async function main(): Promise<void> {
  const ownedFeedIds: string[] = []
  let failed = false
  let failure: unknown
  try {
    await checkTieredContract(ownedFeedIds)
  } catch (err) {
    failed = true
    failure = err
  }

  const cleanupErrors: unknown[] = []
  for (const id of ownedFeedIds) {
    try {
      assert.equal(await hardDeleteRssFeedById(id), true, `owned RSS feed ${id} must be deleted`)
    } catch (err) {
      cleanupErrors.push(err)
    }
  }
  try {
    await refreshMaterializedView('mv_rss_feed_crawl_tiers')
    const { rows: remaining } = await read<{ rss_feed_id: string }>(
      sql`/* checkRssFeedCrawlTiers.remaining */
        SELECT rss_feed_id FROM mv_rss_feed_crawl_tiers
        WHERE rss_feed_id = ANY(${ownedFeedIds}::uuid[])
      `,
    )
    assert.deepEqual(remaining, [], 'refreshed MV must contain no owned feed rows')
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await rssFeedCrawlConfig.close()
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await shutdownDataStoresForOneOffCommand()
  } catch (err) {
    cleanupErrors.push(err)
  }
  if (failed && cleanupErrors.length > 0) {
    throw new AggregateError([failure, ...cleanupErrors], 'RSS tier contract and cleanup failed')
  }
  if (failed) throw failure
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'RSS tier cleanup failed')
}

if (import.meta.main) await main()
