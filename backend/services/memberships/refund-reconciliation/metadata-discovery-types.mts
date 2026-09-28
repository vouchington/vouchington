export type MetadataDiscoverableRefund = {
  id: string
  metadata?: Record<string, string> | null
}

export type RefundMetadataPage = {
  hasMore: boolean
  nextCursor: string | null
  refunds: MetadataDiscoverableRefund[]
}

export type RefundMetadataScanState = {
  completedAt: Date | null
  nextProviderRefundId: string | null
  stableHeadProviderRefundId: string | null
}
