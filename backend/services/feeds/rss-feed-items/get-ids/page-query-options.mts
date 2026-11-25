import type { RssFeedItemFeedOptions, RssFeedItemFeedType } from '../../types.mts'

export type FeedPageQueryOptions = {
  communityId?: string
  currentUserId?: string
  currentUserIsAdministrator: boolean
  feedType: RssFeedItemFeedType
  filters: RssFeedItemFeedOptions
  cutoffDate: Date
  itemCutoffId: string
  cursorSortAt?: string
  cursorId?: string
  safeLimit: number
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
  includeDirectItems: boolean
  includeSharedItems: boolean
  inspectionCap: number
  inspectionCapMax: number
}
