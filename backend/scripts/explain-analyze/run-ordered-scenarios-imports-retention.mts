import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runImportRequestRetentionScenarios } from './run-scenarios/import-request-retention.mts'
import { runOrphanedOAuthBatchScenarios } from './run-scenarios/orphaned-oauth-batch.mts'
import { runRetentionBatchPickOnceScenarios } from './run-scenarios/retention-batch-pick-once.mts'

export const IMPORTS_RETENTION_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runTopicImportAttemptScenarios,
  runImportRequestRetentionScenarios,
  runOrphanedOAuthBatchScenarios,
  runRetentionBatchPickOnceScenarios,
]
