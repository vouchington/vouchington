import type { Topic } from '@/types/topics'
import type { Post } from '@/types/posts'
import type { Hostname } from '@/types/hostnames'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { Community } from '@/types/api-responses'
import type { FediverseSearchResult } from '@/types/fediverse-search'
import type { PageInfo } from '@voucha/types/pagination'

type FullPostSearchResult = Pick<
  Post,
  'id' | 'post_type' | 'title' | 'markdown' | 'declared_language' | 'lingua_rs_detected_language'
>

/** The combined endpoint keeps authored text distinct from its UI display fallback. */
type CombinedPostSearchResult = Pick<
  Post,
  'id' | 'post_type' | 'declared_language' | 'lingua_rs_detected_language'
> & {
  title: string
  authored_title: string | null
}

export type CommandSearchPost = FullPostSearchResult | CombinedPostSearchResult

export type SearchResults = {
  topics: Topic[]
  posts: CommandSearchPost[]
  posts_page_info?: PageInfo
  /** Identifies the query and tab that produced this result for safe continuation. */
  searchKey?: string
  news: RssFeedItem[]
  domains: Hostname[]
  communities: Community[]
  fediverse: FediverseSearchResult[]
}
