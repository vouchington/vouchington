export type PostImageRollback = {
  revisionId: string
  currentImages: Array<{ image_id: string; order_index: number; caption: string }>
  images: Array<{ image_id: string; order_index: number; caption: string }>
  currentLlmModerationContentSha256: Buffer
  llmModerationContentSha256: Buffer
  currentLatestClearanceChangeId: string | null
  latestClearanceChangeId: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  inReviewAt: Date | null
  clearanceChangedById: string | null
  clearancePublicReasonCode: string | null
  clearancePrivateNote: string | null
  clearancePlatformOverride: boolean
}
