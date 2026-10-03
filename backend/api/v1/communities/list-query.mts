import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'
import {
  isCommunityRootPostType,
  type CommunityRootPostType,
  type CommunitySortMode,
} from '@services/communities'
import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryInteger,
  queryString,
  queryUuid,
} from '@modules/pagination'

export function parseEligiblePostType(
  ctx: Context,
  currentUser: PrivateUser | null,
): CommunityRootPostType | undefined {
  const eligiblePostTypeParam = ctx.query.eligible_post_type as string | undefined
  if (eligiblePostTypeParam === undefined) return undefined
  ctx.assert(
    isCommunityRootPostType(eligiblePostTypeParam),
    400,
    'Invalid eligible_post_type value',
  )
  ctx.assert(currentUser, 401, 'Unauthorized')
  return eligiblePostTypeParam
}

export const VALID_SORT_MODES = [
  'name',
  'members',
  'virtual_subscriptions',
] as const satisfies readonly CommunitySortMode[]
export const VALID_LIST_TYPES = ['follow', 'mute'] as const
export const VALID_LIST_SCOPES = ['mine'] as const
export const VALID_FEED_CATEGORIES = ['posts', 'news', 'news_sources', 'news_topics'] as const

export const communitiesQuery = defineQueryContract({
  q: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 20 }),
  after: queryString(),
  member_id: queryEnum(['me']),
  eligible_post_type: queryEnum(['discussion', 'review', 'data_point']),
  sort: queryEnum(VALID_SORT_MODES),
  list_type: queryEnum(VALID_LIST_TYPES),
  list_scope: queryEnum(VALID_LIST_SCOPES),
  feed_category: queryEnum(VALID_FEED_CATEGORIES),
  has_list_type: queryBoolean(),
  has_list_items: queryBoolean(),
  topic: queryCsvArray(queryUuid(), { description: 'Repeated topic UUID query values.' }),
})

export interface CommunitiesListQuery {
  sort: CommunitySortMode
  listType: 'follow' | 'mute' | undefined
  listScopeParam: 'mine' | undefined
  feedCategory: (typeof VALID_FEED_CATEGORIES)[number] | undefined
}

// Preserve route-specific 400/401 checks before the generated query boundary.
export function parseCommunitiesListQuery(
  ctx: Context,
  currentUser: PrivateUser | null,
): CommunitiesListQuery {
  const sortParam = ctx.query.sort as string | undefined
  if (sortParam && !VALID_SORT_MODES.includes(sortParam as CommunitySortMode)) {
    ctx.throw(400, `Invalid sort value. Must be one of: ${VALID_SORT_MODES.join(', ')}`)
  }
  const sort: CommunitySortMode =
    sortParam && VALID_SORT_MODES.includes(sortParam as CommunitySortMode)
      ? (sortParam as CommunitySortMode)
      : 'name'

  const listTypeParam = ctx.query.list_type as string | undefined
  if (listTypeParam && !(VALID_LIST_TYPES as readonly string[]).includes(listTypeParam)) {
    ctx.throw(400, `Invalid list_type value. Must be one of: ${VALID_LIST_TYPES.join(', ')}`)
  }

  const listScopeParam = ctx.query.list_scope as string | undefined
  if (listScopeParam && !(VALID_LIST_SCOPES as readonly string[]).includes(listScopeParam)) {
    ctx.throw(400, `Invalid list_scope value. Must be one of: ${VALID_LIST_SCOPES.join(', ')}`)
  }
  if (listScopeParam === 'mine') ctx.assert(currentUser, 401, 'Unauthorized')

  const feedCategoryParam = ctx.query.feed_category as string | undefined
  if (
    feedCategoryParam &&
    !VALID_FEED_CATEGORIES.includes(feedCategoryParam as (typeof VALID_FEED_CATEGORIES)[number])
  ) {
    ctx.throw(
      400,
      `Invalid feed_category value. Must be one of: ${VALID_FEED_CATEGORIES.join(', ')}`,
    )
  }

  return {
    sort,
    listType: listTypeParam as 'follow' | 'mute' | undefined,
    listScopeParam: listScopeParam as 'mine' | undefined,
    feedCategory: feedCategoryParam as (typeof VALID_FEED_CATEGORIES)[number] | undefined,
  }
}
