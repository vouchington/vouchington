import { enqueueContinueAuditReviewSuccessionHistory } from '@queues/post-publication/enqueues'
import type { ReviewSuccessionHistoryAuditJobData } from '@queues/post-publication/types'
import { auditReviewSuccessionHistory } from '@services/posts/review-successions/index'

type ReviewSuccessionHistoryAuditProcessorDependencies = {
  auditReviewSuccessionHistory: typeof auditReviewSuccessionHistory
  enqueueContinueAuditReviewSuccessionHistory: typeof enqueueContinueAuditReviewSuccessionHistory
}

const defaultDependencies: ReviewSuccessionHistoryAuditProcessorDependencies = {
  auditReviewSuccessionHistory,
  enqueueContinueAuditReviewSuccessionHistory,
}

export async function processAuditReviewSuccessionHistory(
  data: ReviewSuccessionHistoryAuditJobData,
  dependencies: Partial<ReviewSuccessionHistoryAuditProcessorDependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies }
  const result = await deps.auditReviewSuccessionHistory(data)
  if (result.hasMore) {
    if (!result.cursor)
      throw new TypeError('Review succession history continuation requires a cursor')
    await deps.enqueueContinueAuditReviewSuccessionHistory(result.cursor, result.cutoffArchivedAt)
  }
  return result
}
