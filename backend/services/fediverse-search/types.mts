export type FediverseSearchProvider = 'peertube' | 'mastodon' | 'lemmy' | 'bluesky'
export type FediverseSearchResultType = 'video' | 'post' | 'profile' | 'instance'
export type FediverseSearchBucketStatus = 'ok' | 'partial' | 'error'

export type FediverseSearchOptions = {
  q: string
  providers?: FediverseSearchProvider[]
  type?: FediverseSearchResultType
  limit?: number
  cursor?: string
}

export type FediverseSearchResult = {
  provider: FediverseSearchProvider
  result_type: FediverseSearchResultType
  source_hostname: string
  external_url: string
  title: string
  summary: string
  author_name: string | null
  author_url: string | null
  published_at: string | null
  thumbnail_url?: string | null
}

export type FediverseSearchBucket = {
  provider: FediverseSearchProvider
  status: FediverseSearchBucketStatus
  items: FediverseSearchResult[]
  next_cursor?: string | null
  error_code?: string | null
}

export type FediverseSearchResponse = {
  buckets: FediverseSearchBucket[]
}

export type FediverseProviderAdapter = {
  provider: FediverseSearchProvider
  search(options: FediverseSearchOptions): Promise<FediverseSearchBucket>
}
