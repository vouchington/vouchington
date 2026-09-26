export interface WebFixtureClientEndpointContext {
  readonly admin: Pick<
    typeof import('@/lib/api/client/admin'),
    'getArticleSyncStatus' | 'triggerArticleSync'
  >
  readonly adminOAuthClients: Pick<
    typeof import('@/lib/api/client/admin-oauth-clients'),
    'getAdminOAuthClients' | 'unverifyOAuthClient' | 'verifyOAuthClient'
  >
  readonly apiKeys: Pick<typeof import('@/lib/api/client/api-keys'), 'createApiKey' | 'getApiKeys'>
  readonly auth: Pick<typeof import('@/lib/api/client/auth'), 'acknowledgeOAuthAuthorization'>
  readonly captchaConfig: Pick<
    typeof import('@/lib/api/client/captcha-config'),
    'fetchCaptchaConfig'
  >
  readonly communities: Pick<
    typeof import('@/lib/api/client/communities'),
    'fetchCommunityPinnedPosts' | 'updateCommunityPostTypeSettings'
  >
  readonly communityBans: Pick<
    typeof import('@/lib/api/client/community-bans'),
    'fetchCommunityBans'
  >
  readonly communityAgentPrompts: Pick<
    typeof import('@/lib/api/client/community-agent-prompts'),
    'fetchCommunityAgentPromptHistory' | 'fetchCommunityAgentPrompts' | 'simulateCommunityAutomod'
  >
  readonly communityAiAgents: Pick<
    typeof import('@/lib/api/client/community-ai-agents'),
    'enableCommunityAiAgent'
  >
  readonly communityArchive: Pick<
    typeof import('@/lib/api/client/community-archive'),
    'archiveCommunity'
  >
  readonly communityAutomod: Pick<
    typeof import('@/lib/api/client/community-automod'),
    'recordCommunityAutomodFeedback'
  >
  readonly communityRestrictions: Pick<
    typeof import('@/lib/api/client/community-restrictions'),
    'fetchCommunityRestrictions'
  >
  readonly communitySearch: Pick<
    typeof import('@/lib/api/client/community-search'),
    'fetchCommunities'
  >
  readonly communityModeratorStats: Pick<
    typeof import('@/lib/api/client/community-moderator-stats'),
    'fetchCommunityModeratorStats'
  >
  readonly currencies: Pick<typeof import('@/lib/api/client/currencies'), 'fetchCurrencies'>
  readonly copyrightEmailIntakes: Pick<
    typeof import('@/lib/api/client/copyright-email-intakes'),
    'listCopyrightEmailIntakes'
  >
  readonly copyrightNotices: Pick<
    typeof import('@/lib/api/client/copyright-notices'),
    'listCopyrightNotices' | 'listCopyrightReviewQueue'
  >
  readonly dynamicConfig: Pick<
    typeof import('@/lib/api/client/dynamic-config'),
    | 'fetchDynamicConfigNamespace'
    | 'fetchDynamicConfigNamespaceHistory'
    | 'fetchDynamicConfigNamespaces'
    | 'updateDynamicConfigNamespace'
  >
  readonly entityRelations: Pick<
    typeof import('@/lib/api/client/entity-relations'),
    'createEntityRelation' | 'fetchEntityRelations' | 'submitEntityRelationVote'
  >
  readonly featureFlags: Pick<
    typeof import('@/lib/api/client/feature-flags'),
    'getFeatureFlagsClient'
  >
  readonly friendRecommendations: Pick<
    typeof import('@/lib/api/client/friend-recommendations'),
    'getFriendRecommendations'
  >
  readonly households: Pick<
    typeof import('@/lib/api/client/households'),
    | 'createHousehold'
    | 'getHouseholdMembershipsClient'
    | 'getHouseholdsClient'
    | 'removeHouseholdMembership'
  >
  readonly memberships: Pick<
    typeof import('@/lib/api/client/memberships'),
    'createMembershipRefund'
  >
  readonly importExport: Pick<
    typeof import('@/lib/api/client/import-export'),
    'exportTopics' | 'getRssFeedImport' | 'importRssFeeds' | 'importTopics'
  >
  readonly modmail: Pick<
    typeof import('@/lib/api/client/modmail'),
    | 'createSavedReply'
    | 'getCommunitySavedReplies'
    | 'getModmailInboxClient'
    | 'getModmailMessagesClient'
  >
  readonly modlog: Pick<typeof import('@/lib/api/client/modlog'), 'fetchCommunityModlog'>
  readonly moderatorVacation: Pick<
    typeof import('@/lib/api/client/moderator-vacation'),
    'fetchMyModeratorVacation'
  >
  readonly mq: Pick<
    typeof import('@/lib/api/client/mq'),
    | 'fetchBackfills'
    | 'fetchQueueStats'
    | 'fetchQueues'
    | 'fetchScheduledJobs'
    | 'pauseQueue'
    | 'resumeQueue'
    | 'triggerBackfill'
    | 'triggerScheduledJob'
  >
  readonly my: Pick<
    typeof import('@/lib/api/client/my'),
    | 'createMyCard'
    | 'createMyRewardsProgramPointValuation'
    | 'createMyRewardsProgramStatus'
    | 'createMySpendingCategory'
    | 'deleteMyCard'
    | 'deleteMyRewardsProgramPointValuation'
    | 'deleteMyRewardsProgramStatus'
    | 'deleteMySpendingCategory'
    | 'getMySpendingCategoriesClient'
    | 'replaceMyLandingPageItems'
    | 'updateMyCard'
    | 'updateMyRewardsProgramPointValuation'
    | 'updateMyRewardsProgramStatus'
    | 'updateMySpendingCategory'
  >
  readonly myNotifications: Pick<
    typeof import('@/lib/api/client/my-notifications'),
    'getMyWebPushSubscriptionsClient'
  >
  readonly oauthApps: Pick<
    typeof import('@/lib/api/client/oauth-apps'),
    'createOAuthApp' | 'getOAuthApps' | 'revokeOAuthApp' | 'rotateOAuthAppSecret' | 'updateOAuthApp'
  >
  readonly oauthGrants: Pick<
    typeof import('@/lib/api/client/oauth-grants'),
    'getOAuthGrants' | 'revokeOAuthGrant'
  >
  readonly podcastEpisodeChapters: Pick<
    typeof import('@/lib/api/client/podcast-episode-chapters'),
    'fetchPodcastEpisodeChapters'
  >
  readonly psql: Pick<
    typeof import('@/lib/api/client/psql'),
    'enqueuePsqlJob' | 'fetchMigrations' | 'fetchPartitions'
  >
  readonly referralClicks: Pick<
    typeof import('@/lib/api/client/referral-clicks'),
    'getMyReferralClicksClient'
  >
  readonly referralLinks: Pick<
    typeof import('@/lib/api/client/referral-links'),
    'getAllReferralLinks' | 'getMyReferralLinksClient'
  >
  readonly reports: Pick<
    typeof import('@/lib/api/client/reports'),
    'getCommunityPendingModerationReportsClient'
  >
  readonly topics: Pick<typeof import('@/lib/api/client/topics'), 'createTopic' | 'fetchTopics'>
  readonly valkey: Pick<
    typeof import('@/lib/api/client/valkey'),
    'clearCache' | 'fetchCacheGroups' | 'flushValkey' | 'rebuildBloomFilter'
  >
  readonly users: Pick<
    typeof import('@/lib/api/client/users'),
    'createUserDataRequest' | 'deleteUser' | 'getUserDataRequest'
  >
  readonly warnings: Pick<typeof import('@/lib/api/client/warnings'), 'issueCommunityUserWarning'>
}
