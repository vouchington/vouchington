import { runCopyrightAcceptedPageScenarios } from './run-scenarios/copyright-accepted-pages.mts'
import { runSitemapPageScenarios } from './run-scenarios/sitemap-pages.mts'
import { runStoryProjectionWorkScenarios } from './run-scenarios/story-projection-work.mts'
import { runImageQuarantineScenarios } from './run-scenarios/image-quarantine.mts'
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runMaterializedViewRefreshScenarios } from './run-scenarios/materialized-view-refreshes.mts'
import { runIngestionRawPageScenarios } from './run-scenarios/ingestion-raw-pages.mts'
import { runHostnameBlocklistScenario } from './run-scenarios/hostname-blocklist.mts'
import { runHostnameCrawlSweepScenarios } from './run-scenarios/hostname-crawl-sweeps.mts'
import { runCrawlerBoilerplateScenario } from './run-scenarios/crawler-boilerplate.mts'

export const INGESTION_CRAWL_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCopyrightAcceptedPageScenarios,
  runSitemapPageScenarios,
  runStoryProjectionWorkScenarios,
  runImageQuarantineScenarios,
  runBloomReconciliationScenarios,
  runMaterializedViewRefreshScenarios,
  runIngestionRawPageScenarios,
  runHostnameBlocklistScenario,
  runHostnameCrawlSweepScenarios,
  runCrawlerBoilerplateScenario,
]
