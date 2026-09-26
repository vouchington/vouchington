export interface WebFixtureServerEndpointContext {
  readonly copyrightNotices: Pick<
    typeof import('@/lib/api/server/copyright-notices'),
    'getCopyrightEmailIntakeReviewQueue' | 'getCopyrightNotices' | 'getCopyrightReviewQueue'
  >
  readonly apiKeys: Pick<typeof import('@/lib/api/server/api-keys'), 'getMyApiKeys'>
  readonly communities: Pick<
    typeof import('@/lib/api/server/communities'),
    | 'getCommunities'
    | 'getCommunity'
    | 'getCommunityAiAgents'
    | 'getCommunityApplicationQuestions'
    | 'getCommunityApplications'
    | 'getCommunityInvites'
    | 'getCommunityListDomains'
    | 'getCommunityListItemCounts'
    | 'getCommunityListPosts'
    | 'getCommunityListRssFeeds'
    | 'getCommunityListTopics'
    | 'getCommunityListUrls'
    | 'getCommunityMembers'
    | 'getCommunityNews'
    | 'getCommunityPinnedPosts'
    | 'getCommunityPosts'
  >
  readonly communityAgentPrompts: Pick<
    typeof import('@/lib/api/server/community-agent-prompts'),
    'getCommunityAgentPromptHistory' | 'getCommunityAgentPrompts'
  >
  readonly communityAutomod: Pick<
    typeof import('@/lib/api/server/community-automod'),
    'getCommunityAutomodRecentActions'
  >
  readonly communityModeration: Pick<
    typeof import('@/lib/api/server/community-moderation'),
    | 'getCommunityBans'
    | 'getCommunityModerationQueue'
    | 'getCommunityModeratorStats'
    | 'getCommunityModlog'
  >
  readonly communityModeratorVacation: Pick<
    typeof import('@/lib/api/server/community-moderator-vacation'),
    'getMyModeratorVacation'
  >
  readonly communityRestrictions: Pick<
    typeof import('@/lib/api/server/community-restrictions'),
    'getCommunityRestrictions'
  >
  readonly entityRelations: Pick<
    typeof import('@/lib/api/server/entity-relations'),
    'getEntityRelations'
  >
  readonly featureFlags: Pick<typeof import('@/lib/api/server/feature-flags'), 'getFeatureFlags'>
  readonly feeds: Pick<
    typeof import('@/lib/api/server/feeds'),
    'getReferralLinksFeed' | 'getRssFeedItemsFeed'
  >
  readonly growthMetrics: Pick<typeof import('@/lib/api/server/growth-metrics'), 'getGrowthMetrics'>
  readonly households: Pick<
    typeof import('@/lib/api/server/households'),
    'getHouseholdMemberships' | 'getHouseholds'
  >
  readonly moderationAnalytics: Pick<
    typeof import('@/lib/api/server/moderation-analytics'),
    | 'getCommunityModerationAnalytics'
    | 'getCommunityModerationTransparency'
    | 'getModerationTransparency'
  >
  readonly modmail: Pick<
    typeof import('@/lib/api/server/modmail'),
    'getModmailInboxServer' | 'getModmailThreadMessagesServer'
  >
  readonly my: Pick<
    typeof import('@/lib/api/server/my'),
    | 'getMyCards'
    | 'getMyFriendRecommendations'
    | 'getMyReferralClicks'
    | 'getMyRewardsProgramPointValuations'
    | 'getMyRewardsProgramStatuses'
    | 'getMySpendingCategories'
    | 'getMyWebPushSubscriptions'
  >
  readonly psql: Pick<
    typeof import('@/lib/api/server/psql'),
    'getMigrationStatus' | 'getPartitionStatus'
  >
  readonly referralLinks: Pick<
    typeof import('@/lib/api/server/referral-links'),
    'getAllMyReferralLinks'
  >
  readonly reports: Pick<
    typeof import('@/lib/api/server/reports'),
    'getCommunityPendingModerationReports'
  >
  readonly rssFeedItems: Pick<
    typeof import('@/lib/api/server/rss-feed-items'),
    'getRssFeedItem' | 'getUserRssFeedItemBookmarkReferences'
  >
  readonly topicRecommendations: Pick<
    typeof import('@/lib/api/server/topic-recommendations'),
    'getTopicRecommendation' | 'getTopHashtags'
  >
  readonly topics: Pick<
    typeof import('@/lib/api/server/topics'),
    'getPublisherTypes' | 'getTopics' | 'getUserTags'
  >
  readonly trendingReferralPrograms: Pick<
    typeof import('@/lib/api/server/trending-referral-programs'),
    'getTrendingReferralProgramsEndpoint'
  >
  readonly trendingCommunities: Pick<
    typeof import('@/lib/api/server/trending-communities'),
    'getTrendingCommunities'
  >
  readonly userBookmarkReferences: Pick<
    typeof import('@/lib/api/server/user-bookmark-references'),
    | 'getUserCommunityBookmarkReferences'
    | 'getUserHostnameBookmarkReferences'
    | 'getUserPostBookmarkReferences'
    | 'getUserRssFeedBookmarkReferences'
    | 'getUserTopicBookmarkReferences'
    | 'getUserUrlBookmarkReferences'
    | 'getUserUserBookmarkReferences'
  >
}
