import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getModerationAnalytics } from '@services/moderation-analytics'
import type { ModerationAnalyticsRange } from '@services/moderation-analytics/types'
import {
  searchModeratorActionCounts,
  searchModeratorActions,
  MODERATOR_ACTION_TYPES,
} from '@services/moderator-actions'
import { searchRecentAutomodActions } from '@services/moderation-training'
import { isModerationStaff } from '@services/users'
import { createPaginationParser } from '@modules/pagination'
import { getPaginationLimitsForContract } from '@services/pagination'
import {
  parseLimit,
  parseMaxConfidence,
  parsePostType,
  parseSourceType,
  parseWindowHours,
} from '@services/moderation-training/route-input'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'
import { communityWithGuard } from './community-moderation-guards.mts'

const moderatorStatsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { default: 25, max: 100 },
})

const modlogParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

async function publicUsers(ids: string[]) {
  const users = await getUserPublicByAnyCachedBatch(ids)
  return Object.fromEntries(users.filter(user => user != null).map(user => [user.id, user]))
}

export const communityModerationReadAnalytics: Record<string, CommunityModerationHandler> = {
  async list_automod_actions(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'moderate')
    const result = await searchRecentAutomodActions(community.id, {
      windowHours: parseWindowHours(args.window),
      limit: parseLimit(args.limit),
      after: (args.after as string | undefined) ?? null,
      sourceType: parseSourceType(args.source),
      agentSlug: (args.agent as string | undefined) ?? null,
      postType: parsePostType(args.post_type ?? args.content_type),
      maxConfidence: parseMaxConfidence(args.max_confidence),
    })
    return {
      automod_actions: result.actions,
      stats: result.stats,
      page_info: { has_next_page: result.hasNextPage, end_cursor: result.endCursor },
    }
  },
  async read_moderation_analytics(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'modlog')
    const range = (args.range as ModerationAnalyticsRange | undefined) ?? '30d'
    const metrics = await getModerationAnalytics(range, {
      type: 'community',
      communityId: community.id,
    })
    metrics.moderator_workload.users = await publicUsers(
      metrics.moderator_workload.moderators.map(m => m.actor_user_id),
    )
    return metrics
  },
  async read_moderator_stats(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'modlog')
    const window = args.window === '90' ? 90 : 30
    const { limit, after } = moderatorStatsParser.parse(
      args,
      getPaginationLimitsForContract(moderatorStatsParser.queryContract),
    )
    const { stats, page_info } = await searchModeratorActionCounts({
      communityId: community.id,
      windowDays: window,
      limit,
      after,
    })
    return { window, stats, page_info, users: await publicUsers(stats.map(s => s.actor_user_id)) }
  },
  async read_modlog(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'modlog')
    const { limit, after } = modlogParser.parse(
      args,
      getPaginationLimitsForContract(modlogParser.queryContract),
    )
    const result = await searchModeratorActions({
      communityId: community.id,
      limit,
      after,
      actionType: MODERATOR_ACTION_TYPES.includes(args.action_type as never)
        ? (args.action_type as (typeof MODERATOR_ACTION_TYPES)[number])
        : undefined,
    })
    const actors = await publicUsers(
      result.results.flatMap(row => (row.actor_user_id ? [row.actor_user_id] : [])),
    )
    return {
      results: result.results.map(row => ({
        __entity_type: 'moderator_action' as const,
        id: row.id,
      })),
      page_info: result.page_info,
      moderator_actions: Object.fromEntries(
        result.results.map(row => [
          row.id,
          !isModerationStaff(user) && row.action_type === 'warn'
            ? { ...row, target_user_id: null }
            : row,
        ]),
      ),
      users: actors,
    }
  },
}
