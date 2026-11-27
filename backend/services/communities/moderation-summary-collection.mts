import pMap from 'p-map'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createModerationSummaryScan,
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryCollection,
  type ModerationSummaryRankedCommunity,
} from '@queues/background/enqueues/moderation-summary-state'

import { isCommunityEligible } from './moderation-summary-eligibility.mts'
import { toCard, readDiscussionTitle } from './moderation-summary-card.mts'
import {
  walkModerationSummaryPages,
  type ModerationSummaryStageArgs,
  type ModerationSummaryStageResult,
  type PageStep,
} from './moderation-summary-pages.mts'
import {
  getModerationSummaryEvasionRankCap,
  resolveModerationSummaryStageLimits,
} from './moderation-summary-work.mts'
export type { ModerationSummaryCollection, ModerationSummaryRankedCommunity }

export function rankModerationSummaryCommunities(
  previous: readonly ModerationSummaryRankedCommunity[],
  incoming: ModerationSummaryRankedCommunity,
): ModerationSummaryRankedCommunity[] {
  return [...previous.filter(row => row.communityId !== incoming.communityId), incoming]
    .toSorted(
      (a, b) => b.pendingScore - a.pendingScore || a.communityId.localeCompare(b.communityId),
    )
    .slice(0, 20)
}

/** The memberships stage: finds the next moderated community to rank, or ends the rank phase. */
export async function runModerationSummaryMemberships(
  args: ModerationSummaryStageArgs,
): Promise<ModerationSummaryStageResult> {
  const { pageSize, maxBatches } = resolveModerationSummaryStageLimits('memberships', args.limits)
  const { collection } = args
  const start: ModerationSummaryCollection = {
    ...collection,
    upperMembershipId: collection.upperMembershipId ?? (await readMembershipUpper(args.userId)),
    activityWindowEnd: collection.activityWindowEnd ?? args.windowEnd.toISOString(),
  }
  const step = await walkModerationSummaryPages(start, maxBatches, state =>
    collectMembershipPage(args, state, pageSize),
  )
  return {
    next: step.next ?? 'memberships',
    collection: step.state,
    communities: [...args.communities],
  }
}

async function readMembershipUpper(userId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* moderationSummaryMembershipUpper */
      SELECT id FROM community_members WHERE user_id=${userId} AND removed_at IS NULL
      ORDER BY user_id DESC,id DESC LIMIT 1`)
  return rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
}

async function collectMembershipPage(
  args: ModerationSummaryStageArgs,
  state: ModerationSummaryCollection,
  size: number,
): Promise<PageStep<ModerationSummaryCollection>> {
  const { rows } = await read<{
    id: string
    community_id: string
    role: string
  }>(
    `/* collectModerationSummaryMembershipPage */
      SELECT id, community_id, role FROM community_members
      WHERE user_id = $1 AND removed_at IS NULL
        AND (user_id, id) > ($1, $2)
        AND (user_id, id) <= ($1, $3)
      ORDER BY user_id, id LIMIT $4`,
    [args.userId, state.afterMembershipId, state.upperMembershipId, size],
  )
  const eligible = await pMap(
    rows,
    row =>
      ['owner', 'moderator'].includes(row.role)
        ? isCommunityEligible(args.userId, row.community_id, args.eligibilityAt)
        : Promise.resolve(false),
    { concurrency: 1 },
  )
  const hit = rows.findIndex((_, i) => eligible[i])
  if (hit >= 0) {
    const row = rows[hit]!
    return {
      state: {
        ...state,
        afterMembershipId: row.id,
        scan: createModerationSummaryScan(row.community_id),
      },
      next: 'reviews',
    }
  }
  const next = { ...state, afterMembershipId: rows.at(-1)?.id ?? state.afterMembershipId }
  if (rows.length >= size) return { state: next, next: null }
  const first = state.top[0]
  return first
    ? {
        state: { ...next, scan: createModerationSummaryScan(first.communityId, first.metrics) },
        next: 'members',
      }
    : { state: next, next: 'send' }
}

/** Folds a finished rank scan into the retained top communities and resumes memberships. */
export function completeModerationSummaryRank(
  collection: ModerationSummaryCollection,
): ModerationSummaryCollection {
  const scan = collection.scan!
  const { metrics } = scan
  const pendingScore =
    metrics.pending_post_reviews +
    metrics.pending_applications +
    metrics.pending_reports +
    metrics.escalated_items +
    Math.min(metrics.suspected_ban_evaders, getModerationSummaryEvasionRankCap())
  if (pendingScore === 0) return { ...collection, scan: null }
  return {
    ...collection,
    scan: null,
    eligibleCount: Math.min(120, collection.eligibleCount + 1),
    top: rankModerationSummaryCommunities(collection.top, {
      communityId: scan.communityId,
      pendingScore,
      discussionPostId: null,
      metrics,
    }),
  }
}

/** The card stage: turns one finished discussion scan into its community's card. */
export async function runModerationSummaryCard(
  args: ModerationSummaryStageArgs,
): Promise<ModerationSummaryStageResult> {
  const { collection } = args
  const scan = collection.scan!
  const index = collection.discussionCommunityIndex
  const selected = {
    ...collection.top[index]!,
    discussionPostId: scan.bestDiscussion?.id ?? null,
  }
  const top = collection.top.map((row, i) => (i === index ? selected : row))
  const { rows } = await read<{
    id: string
    name: string
    slug: string
  }>(sql`/* readModerationSummaryCommunity */
        SELECT id,name,slug FROM communities WHERE id=${selected.communityId} AND deleted_at IS NULL AND archived_at IS NULL LIMIT 1`)
  const live =
    rows[0] && (await isCommunityEligible(args.userId, selected.communityId, args.eligibilityAt))
  const cards = live
    ? [
        toCard(
          { ...rows[0], ...scan.metrics },
          scan.bestDiscussion,
          await readDiscussionTitle(selected.communityId, selected.discussionPostId),
        ),
      ]
    : []
  const following = top[index + 1]
  return {
    next: following ? 'members' : 'send',
    collection: {
      ...collection,
      top,
      discussionCommunityIndex: index + 1,
      scan: following
        ? createModerationSummaryScan(following.communityId, following.metrics)
        : null,
    },
    communities: [...args.communities, ...cards],
  }
}
