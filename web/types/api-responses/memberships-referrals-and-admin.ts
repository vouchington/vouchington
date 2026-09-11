import type * as Api from './shared'
export * from './memberships'
export * from './membership-mutations'

type LandingPage = Api.LandingPage
type LandingPageCandidates = Api.LandingPageCandidates
type LandingPageWithItems = Api.LandingPageWithItems
type PublicLandingPage = Api.PublicLandingPage

export interface CacheGroup {
  name: string
  prefixes: string[]
}

export interface CacheGroupsResponseBody {
  groups: CacheGroup[]
}

export interface ClearCacheResponseBody {
  success: boolean
  group: string
}

export interface MigrationStatusResponse {
  applied: string[]
  pending: string[]
  total: number
}

export interface RebuildBloomFilterResponse {
  success: boolean
  filter: string
}

export interface PsqlJobEnqueueResponse {
  success: boolean
}

export interface PartitionInfo {
  name: string
  size_bytes: number
}

export interface PartitionTable {
  name: string
  partition_count: number
  total_size_bytes: number
  partitions: PartitionInfo[]
}

export interface PartitionStatusResponseBody {
  tables: PartitionTable[]
}

export interface LandingPageResponseBody {
  landing_page: LandingPage | LandingPageWithItems
}

/**
 * GET /api/v1/my/landing-pages — bounded by a create-time MAX_LANDING_PAGES cap, so no
 * page_info (unlike the cursor-paginated admin listing).
 */
export interface MyLandingPageListResponseBody {
  results: LandingPage[]
}

export interface LandingPageDetailResponseBody {
  landing_page: LandingPageWithItems
}

export interface LandingPageCandidatesResponseBody {
  candidates: LandingPageCandidates
}

export type PublicLandingPageResponseBody = PublicLandingPage

export interface LandingPageAnalyticsResponseBody {
  analytics: import('../landing-pages').LandingPageAnalytics
}

export type { RefundableCharge, RefundableChargesResponseBody } from './memberships-refund.ts'
export type { MembershipRefund, MembershipRefundResponseBody } from './memberships-refund.ts'
