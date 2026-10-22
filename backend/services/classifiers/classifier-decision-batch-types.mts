export type LockedClassifierDecisionBatch = {
  classifierId: string
  promptVersionId: string
  postId: string | null
  rssFeedItemId: string | null
  scopeCategory: 'global' | 'community_ai'
  scopeCommunityId: string | null
  inputSha256: Buffer | null
  completedAt: Date | null
}
