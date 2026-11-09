import type { UserMetrics } from '@/types/user-metrics'
import { publicUsers } from './users'

export const userMetrics: UserMetrics = {
  __entity_type: 'user_metrics',
  id: publicUsers[0]!.id,
  count: {
    reviews: 8,
    discussions: 12,
    comments: 34,
    users_following: 22,
    users_followers: 180,
    topics_following: 44,
    rss_feeds_following: 16,
    communities_member: 3,
  },
  count_capped: {
    reviews: false,
    discussions: false,
    comments: false,
    users_following: false,
    users_followers: false,
    topics_following: false,
    rss_feeds_following: false,
    communities_member: false,
  },
}
export const communities = [
  {
    id: 'community-credit-cards',
    slug: 'credit-cards',
    name: 'Credit Cards',
    visibility: 'public',
    description_markdown: 'A public community for card reviews and application data points.',
  },
  {
    id: 'community-travel',
    slug: 'travel-redemptions',
    name: 'Travel Redemptions',
    visibility: 'private',
    description_markdown: 'A private community for award trip planning.',
  },
]
