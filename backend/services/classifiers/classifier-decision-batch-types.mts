export type LockedClassifierDecisionBatch = {
  classifierId: string
  promptVersionId: string
  postId: string | null
  rssFeedItemId: string | null
  scopeCategory: 'global' | 'community_ai'
  scopeCommunityId: string | null
  completedAt: Date | null
}
