import { runAccountMessagingScenarios } from './run-scenarios/account-messaging-pages.mts'
import { runRssIngestCapacityScenario } from './run-scenarios/rss-ingest-capacity.mts'
import { runRssHardDeleteSourceCapacityScenario } from './run-scenarios/rss-hard-delete-source-capacity.mts'
import { runAccountListCapacityScenarios } from './run-scenarios/account-lists-at-cap.mts'
import { runRssWriteCapacityScenarios } from './run-scenarios/rss-write-capacity.mts'
import { runAccountHistoryScenarios } from './run-scenarios/account-history-pages.mts'

export const AFTER_ACCOUNTS_RSS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runAccountMessagingScenarios,
  runRssIngestCapacityScenario,
  runRssHardDeleteSourceCapacityScenario,
  runAccountListCapacityScenarios,
  runRssWriteCapacityScenarios,
  runAccountHistoryScenarios,
]
