import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { background } from '@queues/background/queues'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { checkTrendingHttpContracts } from './trending-http.mts'
import { checkRssWorkerContracts } from './rss-worker.mts'
import { checkRssWorkerSparseLane } from './rss-worker-sparse.mts'
import { checkCrawlTierContracts } from './crawl-tiers.mts'
import { checkRevenueContracts } from './revenue.mts'
import { checkHashtagAuthorDeletionContract } from './hashtag-author-deletion.mts'
import { checkHashtagCommunityContracts } from './hashtag-community.mts'
import { checkHashtagEligibilityContracts } from './hashtag-eligibility.mts'
import { checkHashtagRootVisibilityContracts } from './hashtag-root-visibility.mts'
import { checkHashtagSearchRankingContracts } from './hashtag-search-ranking.mts'
import { checkHashtagSearchRssContracts } from './hashtag-search-rss.mts'

async function main(): Promise<void> {
  let failed = false
  let failure: unknown
  try {
    await checkTrendingHttpContracts()
    console.log('Native materialized-view contract passed: trending HTTP')
    await checkRssWorkerSparseLane()
    console.log('Native materialized-view contract passed: RSS worker sparse lane')
    await checkRssWorkerContracts()
    console.log('Native materialized-view contract passed: RSS worker')
    await checkCrawlTierContracts()
    console.log('Native materialized-view contract passed: crawl tiers')
    await checkRevenueContracts()
    console.log('Native materialized-view contract passed: revenue')
    await checkHashtagAuthorDeletionContract()
    console.log('Native materialized-view contract passed: hashtag author deletion')
    await checkHashtagCommunityContracts()
    console.log('Native materialized-view contract passed: hashtag community')
    await checkHashtagEligibilityContracts()
    console.log('Native materialized-view contract passed: hashtag eligibility')
    await checkHashtagRootVisibilityContracts()
    console.log('Native materialized-view contract passed: hashtag root visibility')
    await checkHashtagSearchRankingContracts()
    console.log('Native materialized-view contract passed: hashtag search ranking')
    await checkHashtagSearchRssContracts()
    console.log('Native materialized-view contract passed: hashtag search RSS')
  } catch (err) {
    failed = true
    failure = err
  }
  const cleanupErrors: unknown[] = []
  try {
    await rssFeedCrawlConfig.close()
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await pagedDispatchConfig.close()
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await closeAndUnregisterGlideMQInstance(background)
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await shutdownDataStoresForOneOffCommand()
  } catch (err) {
    cleanupErrors.push(err)
  }
  if (failed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [failure, ...cleanupErrors],
      'Native materialized-view contract and shutdown failed',
    )
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Native materialized-view shutdown failed')
  }
  if (failed) throw failure
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
