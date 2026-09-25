import type { Community } from './types.mts'

type CommunityColumn = Exclude<
  keyof Community,
  '__entity_type' | 'profile_image_placement' | 'banner_image_placement'
>

// Every declared Community column and nothing else: search_vector and the lingua_rs_* detector
// state never reach a response.
const communityColumnNames = Object.keys({
  id: true,
  name: true,
  slug: true,
  markdown: true,
  visibility: true,
  member_roster_visibility: true,
  list_type: true,
  member_invites_allowed_at: true,
  post_approval_required_at: true,
  allow_review_posts: true,
  allow_data_point_posts: true,
  trusted_at: true,
  profile_image_id: true,
  banner_image_id: true,
  created_by_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  deleted_by_id: true,
  archived_at: true,
  archived_by_id: true,
  default_language: true,
  lingua_rs_detected_language: true,
  rules_markdown: true,
} satisfies Record<CommunityColumn, true>)

/** Response-facing `communities` columns qualified by `alias`, for SELECT lists. */
export function communityColumns(alias: string): string {
  return communityColumnNames.map(column => `${alias}.${column}`).join(', ')
}
