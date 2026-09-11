import { buildPageInfo } from '@modules/pagination'
import type { Community, CommunityMetrics } from '../types.mts'
import type { CommunityOwner, CommunitySortMode, SearchCommunitiesResult } from '../search.mts'

type CommunitySearchRow = Community & {
  owner_id: string | null
  owner_username: string | null
  member_count?: number
  post_count?: number
  list_item_count?: number
  proxy_follow_count?: number
  proxy_mute_count?: number
  virtual_subscription_count?: number
}

export function mapCommunitySearchResult(
  rows: unknown[],
  options: {
    limit: number
    needsMetrics: boolean
    sort: CommunitySortMode
  },
): SearchCommunitiesResult {
  const hasNextPage = rows.length > options.limit
  const results: Community[] = []
  const usersMap: Record<string, CommunityOwner> = {}
  const metricsMap: Record<string, CommunityMetrics> = {}

  for (let i = 0; i < Math.min(rows.length, options.limit); i++) {
    const row = rows[i]! as CommunitySearchRow
    results.push({
      __entity_type: 'community',
      id: row.id,
      name: row.name,
      slug: row.slug,
      markdown: row.markdown,
      visibility: row.visibility,
      member_roster_visibility: row.member_roster_visibility,
      list_type: row.list_type,
      member_invites_allowed_at: row.member_invites_allowed_at,
      post_approval_required_at: row.post_approval_required_at,
      allow_review_posts: row.allow_review_posts,
      allow_data_point_posts: row.allow_data_point_posts,
      trusted_at: row.trusted_at,
      profile_image_id: row.profile_image_id,
      banner_image_id: row.banner_image_id,
      created_by_id: row.created_by_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      deleted_by_id: row.deleted_by_id,
      archived_at: row.archived_at,
      archived_by_id: row.archived_by_id,
      default_language: row.default_language ?? null,
      lingua_rs_detected_language: row.lingua_rs_detected_language ?? null,
      rules_markdown: row.rules_markdown,
    })

    if (row.owner_id && !usersMap[row.owner_id]) {
      usersMap[row.owner_id] = { id: row.owner_id, username: row.owner_username }
    }

    if (options.needsMetrics && row.member_count !== undefined) {
      metricsMap[row.id] = {
        __entity_type: 'community_metrics',
        id: row.id,
        member_count: row.member_count,
        post_count: row.post_count ?? 0,
        list_item_count: row.list_item_count ?? 0,
        proxy_follow_count: row.proxy_follow_count ?? 0,
        proxy_mute_count: row.proxy_mute_count ?? 0,
        virtual_subscription_count: row.virtual_subscription_count ?? 0,
      }
    }
  }

  const pageInfo =
    options.sort === 'name'
      ? buildPageInfo(results, { hasNextPage, getCursor: c => ({ name: c.name, id: c.id }) })
      : options.sort === 'members'
        ? buildPageInfo(results, {
            hasNextPage,
            getCursor: c => ({ score: metricsMap[c.id]?.member_count ?? 0, id: c.id }),
          })
        : buildPageInfo(results, {
            hasNextPage,
            getCursor: c => ({
              score: metricsMap[c.id]?.virtual_subscription_count ?? 0,
              id: c.id,
            }),
          })

  return { results, users: usersMap, page_info: pageInfo, community_metrics: metricsMap }
}
