import { deleteExpiredOAuthAuthorizationBatch } from '@services/oauth'
import { runBoundedBatches } from './run-bounded-batches.mts'

type CleanupResult = { deleted: number; hasMore: boolean }

export async function cleanupExpiredOAuthAuthorizations(
  options: {
    batchSize?: number
    maxBatches?: number
    lowerBoundDate?: Date
    now?: Date
    authorizationIds?: readonly string[]
  } = {},
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    deleteExpiredOAuthAuthorizationBatch(batchSize, {
      lowerBoundDate: options.lowerBoundDate,
      now: options.now,
      authorizationIds: options.authorizationIds,
    }),
  )
}
