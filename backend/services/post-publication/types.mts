export const POST_PUBLICATION_REASONS = [
  'post_created',
  'post_updated',
  'post_content_reset',
  'post_audience_changed',
  'post_archived',
  'post_deleted',
  'post_topics_changed',
  'post_related_urls_changed',
  'post_ratings_changed',
  'post_clearance_changed',
  'post_moderation_flag_changed',
  'community_publication_changed',
  'moderation_appeal_resolved',
  'author_suspension_changed',
  'author_deleted',
  'community_visibility_changed',
  'rss_feed_discoverability_changed',
  'rss_feed_enablement_changed',
  'rss_feed_source_changed',
] as const

export type PostPublicationReason = (typeof POST_PUBLICATION_REASONS)[number]
export type PostPublicationScope =
  | { type: 'post'; postId: string }
  | { type: 'author'; authorUserId: string }
  | { type: 'community'; communityId: string }
  | { type: 'rss_feed'; rssFeedId: string }
  | { type: 'topic_alias'; topicAliasId: string }
  | { type: 'story'; storyId: string }
export type PostPublicationChange = {
  scope: PostPublicationScope
  reason: PostPublicationReason
  impactedTopicIds?: readonly string[]
  impactedPostIds?: readonly string[]
  impactedCommunityIds?: readonly string[]
  impactedRssFeedItemIds?: readonly string[]
  footprint?: PostPublicationFootprint
}
export type PostPublicationFootprint = {
  priorAuthorUserId?: string
  /** Public author identity retained before the user is scrubbed or hard-deleted. */
  priorAuthorUsername?: string
  priorCommunityId?: string
  priorRootId?: string
  /** Previous slug for a post scope. */
  priorPostSlug?: string
  /** Previous slug for a community scope. */
  priorCommunitySlug?: string
  /** Exact old sitemap shard required when a post moves out of public eligibility. */
  priorSitemapTarget?: { postType: string; day: string }
}
export type PostPublicationDirtyWork = {
  id: string
  post_id: string | null
  author_user_id: string | null
  community_id: string | null
  rss_feed_id: string | null
  topic_alias_id: string | null
  story_id: string | null
  reasons: PostPublicationReason[]
  generation: string
  cursor_post_id: string | null
  cursor_topic_id: string | null
  cursor_key_id: string | null
  lease_token: string | null
  leased_at: Date | null
  lease_expires_at: Date | null
}
export type ClaimedPostPublicationDirtyWork = PostPublicationDirtyWork & {
  lease_token: string
  leased_at: Date
  lease_expires_at: Date
}
