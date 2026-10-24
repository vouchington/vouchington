import type { TransactionQuery } from '@data-stores/psql'

export type FederationRetentionPosition = { id: string }
export type FederationRetentionScope = {
  followerDistributionIds: readonly string[]
}
export type FederationRetentionPage = {
  deleted: number
  hasMore: boolean
  continuationPosition: FederationRetentionPosition | null
}
export type FederationRetentionCursor = {
  cutoffAt: Date
  cursorId: string | null
  upperBoundId: string
}
export type FederationRetentionQuery = TransactionQuery
