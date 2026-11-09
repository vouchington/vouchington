/** Current projection state grows with its owner; story jobs clean topic receipts in pages. */
export const PROJECTION_STATE_GROWTH_POLICIES: [string, string][] = [
  [
    'community_search_counts',
    'One projected row per community grows with community adoption; indexed count order and keyed hydration bound search reads.',
  ],
  [
    'story_post_category_projection_jobs',
    'Coalesced current work can exist for an unbounded number of stories; each terminal job is deleted and indexed by fairness and story.',
  ],
  [
    'story_post_category_projection_receipts',
    'Current generation receipts can span unbounded distinct topics; keyed story/topic pages support bounded cleanup before work completion.',
  ],
]
