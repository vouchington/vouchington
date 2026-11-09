import type { PostFeedOptions } from '../../types.mts'
import type { PostFeedEligibilityOptions } from './eligible-posts-cte.mts'
import type { PostFeedCursor } from './feed-cursor.mts'

export type PostFeedPageQueryOptions = {
  communityId?: string
  currentUserId: string
  cursor: PostFeedCursor | null
  cutoff: Date | null
  eligibilityOptions: PostFeedEligibilityOptions
  feedType: PostFeedOptions['feed_type']
  includeSharedPosts: boolean
  minScoreFollowTopics: number
  minScoreFollowUsers: number
  safeLimit: number
  candidateLimit: number
}
