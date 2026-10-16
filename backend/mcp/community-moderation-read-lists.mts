import { getPaginationLimitsForContract } from '@services/pagination'
import { indexById } from '@modules/utils'
import {
  buildPageInfo,
  decodeUuidCursor,
  isRankingCursor,
  rankingPaginationParser,
} from '@modules/pagination'
import {
  getRaidModeSuggestion,
  searchApplications,
  searchCommunityBans,
  searchCommunityRestrictions,
  searchInvites,
  loadCommunityForModerator,
} from '@services/communities'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getMyCommunityVacationSettings } from '@services/community-member-vacations'
import { getCommunitySavedReplies } from '@services/modmail'
import type {
  CommunityModerationArgs,
  CommunityModerationHandler,
} from './community-moderation-contract.mts'
import { communityWithGuard } from './community-moderation-guards.mts'

function page(args: CommunityModerationArgs) {
  return { limit: args.limit as number | undefined, after: args.after as string | undefined }
}

async function readBanPage(communityId: string, args: CommunityModerationArgs) {
  const result = await searchCommunityBans(communityId, page(args))
  const publicUsers = await getUserPublicByAnyCachedBatch(result.results.map(b => b.user_id))
  return {
    results: result.results.map(b => ({ __entity_type: 'community_ban', id: b.id })),
    page_info: result.page_info,
    community_bans: Object.fromEntries(
      result.results.map(({ case_id: _, ...ban }) => [ban.id, ban]),
    ),
    users: indexById(publicUsers.filter(user => user != null)),
  }
}

export const communityModerationReadLists: Record<string, CommunityModerationHandler> = {
  async list_applications(user, args) {
    const { community } = await loadCommunityForModerator(user, args.community)
    const result = await searchApplications(community.id, {
      ...page(args),
      status: args.status as 'pending' | 'approved' | 'rejected' | undefined,
    })
    return {
      results: result.results.map(a => ({ __entity_type: 'community_application', id: a.id })),
      page_info: result.page_info,
      community_applications: indexById(result.results),
    }
  },

  async list_bans(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'bans')
    return readBanPage(community.id, args)
  },

  async list_invites(user, args) {
    const { community } = await loadCommunityForModerator(user, args.community)
    const result = await searchInvites(community.id, page(args))
    return {
      results: result.results.map(i => ({ __entity_type: 'community_invite', id: i.id })),
      page_info: result.page_info,
      community_invites: Object.fromEntries(
        result.results.map(({ code: _code, ...invite }) => [invite.id, invite]),
      ),
    }
  },

  async list_restrictions(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'moderate')
    const [result, raid_mode_suggestion] = await Promise.all([
      searchCommunityRestrictions(community.id, page(args)),
      getRaidModeSuggestion(community.id),
    ])
    return {
      results: result.results.map(r => ({ __entity_type: 'community_restriction', id: r.id })),
      page_info: result.page_info,
      community_restrictions: indexById(result.results),
      raid_mode_suggestion,
    }
  },

  async list_saved_replies(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'saved_replies')
    const { after: encodedAfter, limit } = rankingPaginationParser.parse(
      args,
      getPaginationLimitsForContract(rankingPaginationParser.queryContract),
    )
    const after = encodedAfter
      ? decodeUuidCursor(encodedAfter, isRankingCursor, 'Invalid saved reply cursor')
      : undefined
    const rows = await getCommunitySavedReplies(community.id, { after, limit })
    const hasMore = rows.length > limit
    const results = rows.slice(0, limit)
    return {
      results,
      page_info: buildPageInfo(results, {
        hasNextPage: hasMore,
        getCursor: reply => ({ ranking: reply.order_index, id: reply.id }),
      }),
    }
  },

  async read_moderator_vacation(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'vacation')
    return getMyCommunityVacationSettings(user.id, { communityId: community.id })
  },
}
