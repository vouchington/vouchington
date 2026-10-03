import { buildPageInfo } from '@modules/pagination'
import type { Community, CommunityMetrics } from './types.mts'

export type CommunitySortMode = 'name' | 'members' | 'virtual_subscriptions'

export type CommunityFeedCategory = 'posts' | 'news' | 'news_sources' | 'news_topics'

export type CommunityOwner = {
  id: string
  username: string | null
  account_type: import('@services/users/types').PublicUser['account_type']
}

export type SearchCommunitiesResult = {
  results: Community[]
  users: Record<string, CommunityOwner>
  page_info: ReturnType<typeof buildPageInfo>
  community_metrics: Record<string, CommunityMetrics>
}
