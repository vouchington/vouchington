import type { UserMetrics } from './types'
import { now } from './shared'
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
  bookmarks: { follow: { topics: 44, posts: 9, users: 22 } },
  bookmarkers: { follow: 180 },
  bookmarks__updated_at: now,
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
