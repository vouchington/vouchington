export type AiUsageCleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  upperBoundDate?: Date
  recordIds?: readonly string[]
}

export type AiUsageCleanupResult = {
  deleted: number
  hasMore: boolean
  cursorId: string | null
}
