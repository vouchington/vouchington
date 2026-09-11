export type PostPublicationJobs =
  | 'processReconcilePostPublication'
  | 'processShadowAuditPostPublication'
  | 'processAuditReviewSuccessionHistory'

export type PostPublicationShadowAuditJobData = { dryRun: boolean; cursor: string | null }

export type ReviewSuccessionHistoryAuditJobData = {
  cursor: string | null
  cutoffArchivedAt: string | null
}
