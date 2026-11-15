export const MODERATION_SUMMARY_METRIC_KEYS = [
  'pending_post_reviews',
  'pending_applications',
  'pending_reports',
  'escalated_items',
  'suspected_ban_evaders',
  'new_members',
  'departed_members',
  'total_active_members',
  'active_member_count',
  'new_discussion_posts',
  'new_review_posts',
  'new_data_point_posts',
] as const
export type ModerationSummaryMetrics = Record<
  (typeof MODERATION_SUMMARY_METRIC_KEYS)[number],
  number
>
export type ModerationSummaryBestDiscussion = { id: string; replies: number }
export type ModerationSummaryScan = {
  communityId: string
  stage:
    | 'reviews'
    | 'applications'
    | 'report-posts'
    | 'reports'
    | 'evaders'
    | 'members'
    | 'activity-posts'
    | 'replies'
    | 'complete'
  afterId: string
  parentId: string | null
  afterChildId: string
  sourceUpperId: string | null
  childUpperId: string | null
  childCount: number
  metrics: ModerationSummaryMetrics
  bestDiscussion: ModerationSummaryBestDiscussion | null
}
export type ModerationSummaryRankedCommunity = {
  communityId: string
  pendingScore: number
  discussionPostId: string | null
  metrics: ModerationSummaryMetrics
}
export type ModerationSummaryCollection = {
  eventId: string
  phase: 'memberships' | 'community' | 'discussions' | 'ready'
  afterMembershipId: string
  upperMembershipId: string | null
  activityWindowEnd: string | null
  eligibleCount: number
  top: ModerationSummaryRankedCommunity[]
  discussionCommunityIndex: number
  scan: ModerationSummaryScan | null
}
export const MODERATION_SUMMARY_ZERO_ID = '00000000-0000-0000-0000-000000000000'
export function emptyModerationSummaryMetrics(): ModerationSummaryMetrics {
  return {
    pending_post_reviews: 0,
    pending_applications: 0,
    pending_reports: 0,
    escalated_items: 0,
    suspected_ban_evaders: 0,
    new_members: 0,
    departed_members: 0,
    total_active_members: 0,
    active_member_count: 0,
    new_discussion_posts: 0,
    new_review_posts: 0,
    new_data_point_posts: 0,
  }
}
export function createModerationSummaryScan(
  communityId: string,
  stage: ModerationSummaryScan['stage'],
  metrics = emptyModerationSummaryMetrics(),
): ModerationSummaryScan {
  return {
    communityId,
    stage,
    afterId: MODERATION_SUMMARY_ZERO_ID,
    parentId: null,
    afterChildId: MODERATION_SUMMARY_ZERO_ID,
    sourceUpperId: null,
    childUpperId: null,
    childCount: 0,
    metrics: structuredClone(metrics),
    bestDiscussion: null,
  }
}
export function createModerationSummaryCollection(): ModerationSummaryCollection {
  return {
    eventId: crypto.randomUUID(),
    phase: 'memberships',
    afterMembershipId: MODERATION_SUMMARY_ZERO_ID,
    upperMembershipId: null,
    activityWindowEnd: null,
    eligibleCount: 0,
    top: [],
    discussionCommunityIndex: 0,
    scan: null,
  }
}
