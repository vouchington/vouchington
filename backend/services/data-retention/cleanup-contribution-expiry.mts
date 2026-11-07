import { pruneExpiredContributionAdmissions } from '@services/contribution-gating/admission'
import { pruneExpiredContributionAdmissionConsumptions } from '@services/contribution-gating/admission-quota'
import { pruneExpiredTopicImportAttempts } from '@services/user-import-export/topic-import-attempts'
import { getTopicImportAttemptDeletionBatchSize } from './config.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'
import type { CleanupResult, ExpiryCleanupOptions } from './cleanup-run-shapes.mts'

export async function cleanupExpiredContributionAdmissions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissions(options.now, batchSize, options.lowerBoundDate),
  )
}

export async function cleanupExpiredContributionQuotaConsumptions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissionConsumptions(options.now, batchSize, options.lowerBoundDate),
  )
}

export async function cleanupExpiredTopicImportAttempts(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(
    {
      batchSize: options.batchSize ?? getTopicImportAttemptDeletionBatchSize(),
      maxBatches: options.maxBatches,
    },
    async batchSize =>
      pruneExpiredTopicImportAttempts(options.now, batchSize, options.lowerBoundDate),
  )
}
