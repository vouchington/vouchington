export const FEDIVERSE_PROVIDERS = ['peertube', 'mastodon', 'lemmy', 'bluesky'] as const
export type FediverseProvider = (typeof FEDIVERSE_PROVIDERS)[number]
export type FediverseResultType = 'video' | 'post' | 'profile' | 'instance'
export type FediverseProviderStatus = 'ok' | 'partial' | 'error'

export interface FediverseSearchResult {
  provider: FediverseProvider
  result_type: FediverseResultType
  source_hostname: string
  external_url: string
  title: string
  summary: string
  author_name: string | null
  author_url: string | null
  published_at: string | null
  thumbnail_url?: string | null
}

export interface FediverseSearchBucket {
  provider: FediverseProvider
  status: FediverseProviderStatus
  items: FediverseSearchResult[]
  next_cursor?: string | null
  error_code?: string | null
}

export interface FediverseSearchResponse {
  buckets: FediverseSearchBucket[]
}
