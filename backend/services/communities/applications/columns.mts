import type { CommunityApplication } from '../types.mts'

type CommunityApplicationColumn = Exclude<keyof CommunityApplication, '__entity_type'>

// Every declared CommunityApplication column and nothing else.
const communityApplicationColumnNames = Object.keys({
  id: true,
  community_id: true,
  user_id: true,
  answers: true,
  message: true,
  reviewed_at: true,
  reviewed_by_id: true,
  approved_at: true,
  rejected_at: true,
  rejection_reason: true,
  created_at: true,
} satisfies Record<CommunityApplicationColumn, true>)

/** Response-facing `community_applications` columns, for single-table SELECT and RETURNING. */
export const communityApplicationColumns = communityApplicationColumnNames.join(', ')
