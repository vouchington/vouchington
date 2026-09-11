import type { Topic } from './topics'
import type { ViewRssFeed } from './rss-feeds'

export interface Hostname {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
  blocked?: boolean
  crawlable?: boolean | null
  link_rel_follow?: boolean | null
}

interface HostnameRef {
  __entity_type: 'hostname'
  id: string
}

export interface HostnameElection {
  __entity_type: 'hostname_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export interface HostnameListResponse {
  results: HostnameRef[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
  hostnames: Record<string, Hostname>
  topics?: Record<string, Topic>
  hostname_elections?: Record<string, HostnameElection>

  election_votes?: Record<string, { choice: import('@/lib/api/client/elections').SentimentChoice }>
  top_urls_by_hostname_id?: Record<string, Array<{ id: string; url: string; pathname: string }>>
}

export interface ViewCrawler {
  id: string
  description: string
  crawler_type: string
  priority: number
}

export interface HostnameDetailResponse {
  hostname: Hostname
  topic?: Topic | null
  hostname_election?: HostnameElection | null

  election_vote?: { choice: import('@/lib/api/client/elections').SentimentChoice } | null
  top_urls: Array<{ id: string; url: string; pathname: string }>
  rss_feeds: ViewRssFeed[]
  crawlers?: ViewCrawler[]
}

export interface BlockHostnameResult {
  blocked_hostname_count: number
  soft_deleted_relation_count: number
  penalized_user_count: number
}

export type CreateHostnameResponse = {
  id: string
  hostname: string
} & Partial<BlockHostnameResult>

export interface HostnamesCompareResponse {
  hostnames: Record<string, Hostname>
  hostname_elections: Record<string, HostnameElection>

  topics: Record<string, Topic>
}
