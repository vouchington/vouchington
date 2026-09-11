export const ACTIVITYPUB_INBOX_STORAGE_POLICY = {
  unverifiedRetentionMs: 60 * 60 * 1000,
  operationalFailureRetentionMs: 7 * 24 * 60 * 60 * 1000,
  maximumUnverifiedRows: 10_000,
  maximumUnverifiedRawBodyBytes: 256 * 1024 * 1024,
  cleanupBatchSize: 500,
  maximumCleanupBatches: 20,
  cleanupIntervalMs: 5 * 60 * 1000,
  processingLeaseMs: 30 * 60 * 1000,
  capacityRetryAfterSeconds: 300,
} as const

export type ActivityPubInboxStorageSnapshot = {
  retainedRows: number
  retainedRawBodyBytes: number
  unverifiedRows: number
  unverifiedRawBodyBytes: number
}
