import type * as Deps from './dependencies.mts'

type ElectionVote = Deps.ElectionVote
type PageInfo = Deps.PageInfo
type LandingPage = Deps.LandingPage
type LandingPageWithItems = Deps.LandingPageWithItems
type LandingPageAnalytics = Deps.LandingPageAnalytics

export type ApiKeyResponse = {
  api_key: import('@services/api-keys/types').ApiKey
}

export type ApiKeyCreateResponse = {
  api_key: import('@services/api-keys/types').ApiKey
  raw_key: string
}

export type ApiKeysListResponse = {
  results: import('@services/api-keys/types').ApiKey[]
  page_info: PageInfo
}

export type EntityRelationRef = {
  __entity_type: 'entity_relation'
  id: string
}

export type EntityRelationsResponseBody = {
  results: EntityRelationRef[]
  page_info: PageInfo
  entity_relations: Record<
    string,
    import('@services/entity-relations/upsert-helpers').EntityRelation
  >
  entity_relation_elections?: Record<
    string,
    import('@services/elections-votes/entity-relation/types').ViewEntityRelationElection
  >
  election_votes?: Record<string, ElectionVote>
}

export type CacheGroup = {
  name: string
  prefixes: string[]
}

export type CacheGroupsResponseBody = {
  groups: CacheGroup[]
}

export type ClearCacheResponseBody = {
  success: boolean
  group: string
}

export type AdminLandingPagesResponseBody = {
  results: LandingPage[]
  page_info: PageInfo
}

export type AdminLandingPageAnalyticsResponseBody = {
  landing_page: LandingPageWithItems
  analytics: LandingPageAnalytics
}

export type MigrationStatusResponse = {
  applied: string[]
  pending: string[]
  total: number
}

export type PsqlJobEnqueueResponse = {
  success: boolean
}

export type PartitionInfo = {
  name: string
  size_bytes: number
}

export type PartitionTable = {
  name: string
  partition_count: number
  total_size_bytes: number
  partitions: PartitionInfo[]
}

export type PartitionStatusResponseBody = {
  tables: PartitionTable[]
}
