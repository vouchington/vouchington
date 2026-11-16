import pMap from 'p-map'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMinUuidv7ForDate } from '@modules/utils'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import {
  createModerationSummaryScan,
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryCollection,
  type ModerationSummaryRankedCommunity,
} from '@queues/background/enqueues/moderation-summary-state'

import { isCommunityEligible } from './moderation-summary-eligibility.mts'
import { toCard, readDiscussionTitle } from './moderation-summary-card.mts'
import { collectModerationSummaryRankPage } from './moderation-summary-rank-pages.mts'
import {
  collectModerationSummaryMemberPage,
  collectModerationSummaryActivityPostPage,
  collectModerationSummaryReplyPage,
} from './moderation-summary-activity-pages.mts'
import {
  getModerationSummaryWorkLimit,
  moderationSummaryWorkMaxValues,
} from './moderation-summary-work.mts'
export type { ModerationSummaryCollection, ModerationSummaryRankedCommunity }
type Card = CommunityModerationSummaryEmailProps['communities'][number]

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

export async function collectModerationSummaryPage(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  eligibilityAt: Date,
  previous: ModerationSummaryCollection,
  cards: readonly Card[],
  limits?: { membershipPageSize: number; sourcePageSize: number },
): Promise<{ collection: ModerationSummaryCollection; communities: Card[] }> {
  const state = structuredClone(previous)
  if (state.upperMembershipId === null) {
    const { rows } = await read<{ id: string }>(sql`/* moderationSummaryMembershipUpper */
      SELECT id FROM community_members WHERE user_id=${userId} AND removed_at IS NULL
      ORDER BY user_id DESC,id DESC LIMIT 1`)
    state.upperMembershipId = rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
  }
  state.activityWindowEnd ??= windowEnd.toISOString()
  const activityEnd = new Date(state.activityWindowEnd)
  const communities = [...cards]
  const sourceSize = pageSize(limits?.sourcePageSize, 'source_page_size')
  if (state.phase === 'memberships') {
    const size = pageSize(limits?.membershipPageSize, 'membership_page_size')
    const { rows } = await read<{
      id: string
      community_id: string
      role: string
    }>(sql`/* collectModerationSummaryMembershipPage */
      SELECT id,community_id,role FROM community_members WHERE user_id=${userId} AND removed_at IS NULL
        AND id>${state.afterMembershipId} AND id<=${state.upperMembershipId} ORDER BY id LIMIT ${size}`)
    const eligible = await pMap(
      rows,
      row =>
        ['owner', 'moderator'].includes(row.role)
          ? isCommunityEligible(userId, row.community_id, eligibilityAt)
          : Promise.resolve(false),
      { concurrency: 1 },
    )
    for (const [i, row] of rows.entries()) {
      state.afterMembershipId = row.id
      if (!eligible[i]) continue
      state.scan = createModerationSummaryScan(row.community_id, 'reviews')
      state.phase = 'community'
      return { collection: state, communities }
    }
    if (rows.length < size) state.phase = state.top.length ? 'discussions' : 'ready'
    return { collection: state, communities }
  }
  if (state.phase === 'community') {
    if (!state.scan) throw new Error('Rank collection requires its current community')
    await collectModerationSummaryRankPage(state.scan, sourceSize)
    if (state.scan.stage === 'complete') {
      const metrics = state.scan.metrics
      const pendingScore =
        metrics.pending_post_reviews +
        metrics.pending_applications +
        metrics.pending_reports +
        metrics.escalated_items +
        metrics.suspected_ban_evaders
      if (pendingScore > 0) {
        state.eligibleCount = Math.min(120, state.eligibleCount + 1)
        state.top = rankModerationSummaryCommunities(state.top, {
          communityId: state.scan.communityId,
          pendingScore,
          discussionPostId: null,
          metrics,
        })
      }
      state.scan = null
      state.phase = 'memberships'
    }
    return { collection: state, communities }
  }
  if (state.phase === 'discussions') {
    const selected = state.top[state.discussionCommunityIndex]
    if (!selected) {
      state.phase = 'ready'
      return { collection: state, communities }
    }
    state.scan ??= createModerationSummaryScan(selected.communityId, 'members', selected.metrics)
    const endId = getMinUuidv7ForDate(activityEnd)
    const startId = getMinUuidv7ForDate(windowStart)
    if (state.scan.stage === 'members')
      await collectModerationSummaryMemberPage(
        state.scan,
        startId,
        endId,
        windowStart,
        activityEnd,
        sourceSize,
      )
    if (state.scan.stage === 'activity-posts')
      await collectModerationSummaryActivityPostPage(state.scan, startId, endId, sourceSize)
    if (state.scan.stage === 'replies')
      await collectModerationSummaryReplyPage(state.scan, endId, sourceSize)
    if (state.scan.stage === 'complete') {
      selected.discussionPostId = state.scan.bestDiscussion?.id ?? null
      const { rows } = await read<{
        id: string
        name: string
        slug: string
      }>(sql`/* readModerationSummaryCommunity */
        SELECT id,name,slug FROM communities WHERE id=${selected.communityId} AND deleted_at IS NULL AND archived_at IS NULL LIMIT 1`)
      if (rows[0] && (await isCommunityEligible(userId, selected.communityId, eligibilityAt)))
        communities.push(
          toCard(
            { ...rows[0], ...state.scan.metrics },
            state.scan.bestDiscussion,
            await readDiscussionTitle(selected.communityId, selected.discussionPostId),
          ),
        )
      state.scan = null
      state.discussionCommunityIndex++
      if (state.discussionCommunityIndex === state.top.length) state.phase = 'ready'
    }
  }
  return { collection: state, communities }
}

function pageSize(
  value: number | undefined,
  field: keyof typeof moderationSummaryWorkMaxValues,
): number {
  if (value === undefined) return getModerationSummaryWorkLimit(field)
  if (!Number.isSafeInteger(value) || value < 1 || value > moderationSummaryWorkMaxValues[field])
    throw new RangeError('Invalid moderator digest work page size')
  return value
}
