import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../response-helpers.mts'
import {
  searchCommunities,
  createCommunity,
  validateCreateCommunityInput,
  getPendingApplicationCommunityIds,
  getCommunityMemberBatch,
  type CreateCommunityInput,
  type CommunitySortMode,
} from '@services/communities'
import { assertCanCreateCommunity } from '@services/communities/authorization'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { assertNotSuspended } from '@services/users'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { indexById } from '@modules/utils'
import { clampAnonLimit } from '@modules/search-utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import { parseEligiblePostType } from './list-query.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

const VALID_SORT_MODES: CommunitySortMode[] = ['name', 'members', 'virtual_subscriptions']
const VALID_LIST_TYPES = ['follow', 'mute']
const VALID_MEMBER_ROSTER_VISIBILITIES = ['public', 'users', 'members', 'moderators']
const VALID_LIST_SCOPES = ['mine']
const VALID_FEED_CATEGORIES = ['posts', 'news', 'news_sources', 'news_topics'] as const
app
  .route('/api/v1/communities')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/communities')

    const rawQ = ctx.query.q as string | undefined
    let limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined
    const memberIdParam = ctx.query.member_id as string | undefined
    if (memberIdParam !== undefined && memberIdParam !== 'me')
      ctx.throw(400, 'Invalid member_id value')
    if (memberIdParam === 'me') ctx.assert(currentUser, 401, 'Unauthorized')
    const memberUserId = memberIdParam === 'me' ? currentUser?.id : undefined
    const eligiblePostType = parseEligiblePostType(ctx, currentUser)

    const sortParam = ctx.query.sort as string | undefined
    const sort: CommunitySortMode =
      sortParam && VALID_SORT_MODES.includes(sortParam as CommunitySortMode)
        ? (sortParam as CommunitySortMode)
        : 'name'
    if (sortParam && !VALID_SORT_MODES.includes(sortParam as CommunitySortMode)) {
      ctx.throw(400, `Invalid sort value. Must be one of: ${VALID_SORT_MODES.join(', ')}`)
    }

    const listTypeParam = ctx.query.list_type as string | undefined
    if (listTypeParam && !VALID_LIST_TYPES.includes(listTypeParam)) {
      ctx.throw(400, `Invalid list_type value. Must be one of: ${VALID_LIST_TYPES.join(', ')}`)
    }
    const listType = listTypeParam as 'follow' | 'mute' | undefined

    const hasListType = ctx.query.has_list_type === 'true'
    const hasListItems = ctx.query.has_list_items === 'true'
    const listScopeParam = ctx.query.list_scope as string | undefined
    if (listScopeParam && !VALID_LIST_SCOPES.includes(listScopeParam)) {
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
    const feedCategory = feedCategoryParam as (typeof VALID_FEED_CATEGORIES)[number] | undefined

    if (!currentUser && limit !== undefined) {
      limit = clampAnonLimit(limit)
    }

    let hashtagTopicIds: string[] = []
    let hashtagHasNoMatches = false
    let textSearchQuery: string | undefined
    try {
      const hashtagResult = await resolveHashtagTopicSearch(rawQ)
      hashtagTopicIds = hashtagResult.topicIds
      textSearchQuery = hashtagResult.textSearchQuery
      hashtagHasNoMatches =
        hashtagResult.hasUnknown ||
        hashtagResult.filters.some(filter => filter.kind === 'exact_alias')
    } catch (err) {
      sendHashtagTopicSearchErrorResponse(ctx, err)
      return
    }

    const topicParam = ctx.query.topic
    const topicParams = Array.isArray(topicParam)
      ? (topicParam as string[])
      : typeof topicParam === 'string'
        ? [topicParam]
        : []
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of topicParams) {
      if (!uuidRegex.test(id)) {
        ctx.throw(400, 'Invalid topic UUID format')
      }
    }
    const topicIds = [...new Set([...hashtagTopicIds, ...topicParams])]

    const result = await searchCommunities({
      currentUser,
      search: textSearchQuery,
      limit,
      after,
      memberUserId,
      sort,
      listType,
      listScope: listScopeParam as 'mine' | undefined,
      feedCategory,
      hasListType: hasListType || undefined,
      hasListItems: hasListItems || undefined,
      topicIds: topicIds.length > 0 ? topicIds : undefined,
      hashtagHasNoMatches,
      eligiblePostType,
    })

    const communities = result.results

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const communityIds = communities.map(c => c.id)

    const [communityMemberships, pendingApplicationCommunityIds] = currentUser
      ? await Promise.all([
          getCommunityMemberBatch(currentUser.id, communityIds),
          getPendingApplicationCommunityIds(currentUser.id, communityIds),
        ])
      : [null, null]

    const searchResults = communities.map(c => ({ __entity_type: 'community' as const, id: c.id }))

    const output: Record<string, unknown> = {
      results: searchResults,
      page_info: result.page_info,
      communities: indexById(communities),
      users: result.users,
      community_metrics: result.community_metrics,
    }

    if (currentUser) {
      output.community_memberships = communityMemberships
      output.pending_application_community_ids = [...(pendingApplicationCommunityIds ?? new Set())]
      output.bookmarks = getBookmarksForEntities(currentUser, 'community', communityIds)
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities')
    const provenance = getRequestContentProvenance()
    assertNotSuspended(currentUser)
    assertCanCreateCommunity(currentUser)

    const raw = (await ctx.request.json('1mb')) as Record<string, unknown>
    const body = raw as CreateCommunityInput
    body.member_invites_allowed_at = raw.member_invites_allowed_at ? new Date() : null
    body.post_approval_required_at = raw.post_approval_required_at ? new Date() : null
    if ('list_type' in raw) {
      const lt = raw.list_type
      if (lt !== null && lt !== 'follow' && lt !== 'mute') {
        ctx.throw(422, 'list_type must be "follow", "mute", or null')
      }
      body.list_type = lt as 'follow' | 'mute' | null
    }
    if ('member_roster_visibility' in raw) {
      const value = raw.member_roster_visibility
      if (!VALID_MEMBER_ROSTER_VISIBILITIES.includes(value as string)) {
        ctx.throw(422, 'member_roster_visibility must be public, users, members, or moderators')
      }
      body.member_roster_visibility = value as CreateCommunityInput['member_roster_visibility']
    }
    validateCreateCommunityInput(body)
    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const membershipPlan = await getUserActivePlan(currentUser.id)
    await verifyCaptchaOrAttestation(ctx, raw, { actionTag: 'communities.create' })
    await assertWithinContributionActionLimit(currentUser, membershipPlan, 'community')

    const community = await createCommunity(provenance, currentUser.id, body)
    const { owner: _owner, ...communityData } = community

    ctx.setStatus(201)
    ctx.json({ community: communityData })
  })
