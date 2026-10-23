import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { background } from '@queues/background/queues'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { checkTrendingHttpContracts } from './trending-http.mts'
import { checkTrendingServiceContracts } from './trending-service.mts'
import { checkRefreshLockContracts } from './refresh-lock.mts'
import { checkRssWorkerContracts } from './rss-worker.mts'
import { checkRssWorkerPagedContracts } from './rss-worker-paged.mts'
import { checkCrawlTierContracts } from './crawl-tiers.mts'
import { checkRevenueContracts } from './revenue.mts'
import { checkHashtagAuthorDeletionContract } from './hashtag-author-deletion.mts'
import { checkHashtagCommunityContracts } from './hashtag-community.mts'
import { checkHashtagEligibilityContracts } from './hashtag-eligibility.mts'
import { checkHashtagRootVisibilityContracts } from './hashtag-root-visibility.mts'
import { checkHashtagSearchRankingContracts } from './hashtag-search-ranking.mts'
import { checkHashtagSearchRssContracts } from './hashtag-search-rss.mts'

const contracts: ReadonlyArray<readonly [string, () => Promise<void>]> = [
  ['trending HTTP', checkTrendingHttpContracts],
  ['trending service', checkTrendingServiceContracts],
  ['refresh lock', checkRefreshLockContracts],
  ['RSS worker paged', checkRssWorkerPagedContracts],
  ['RSS worker', checkRssWorkerContracts],
  ['crawl tiers', checkCrawlTierContracts],
  ['revenue', checkRevenueContracts],
  ['hashtag author deletion', checkHashtagAuthorDeletionContract],
  ['hashtag community', checkHashtagCommunityContracts],
  ['hashtag eligibility', checkHashtagEligibilityContracts],
  ['hashtag root visibility', checkHashtagRootVisibilityContracts],
  ['hashtag search ranking', checkHashtagSearchRankingContracts],
  ['hashtag search RSS', checkHashtagSearchRssContracts],
]

async function main(): Promise<void> {
  let failed = false
  let failure: unknown
  try {
    for (const [name, check] of contracts) {
      await check()
      console.log(`Native materialized-view contract passed: ${name}`)
    }
  } catch (err) {
    failed = true
    failure = err
  }
  const cleanupErrors: unknown[] = []
  for (const close of [
    () => rssFeedCrawlConfig.close(),
    () => pagedDispatchConfig.close(),
    () => closeAndUnregisterGlideMQInstance(background),
    () => shutdownDataStoresForOneOffCommand(),
  ]) {
    try {
      await close()
    } catch (err) {
      cleanupErrors.push(err)
    }
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
