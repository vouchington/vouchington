import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ModerationReportTargetContent } from '@services/moderation-reports/target-metadata'
import type { ModerationReportStatus } from '@services/moderation-reports/config'
import type { PendingModerationReport } from '@services/moderation-reports/get'
import { applyDeletedTargetLabel } from '@services/moderation-reports/redaction'
import { attachJudgements } from '@services/moderation-reports/judgement-attach'
import { attachPostModerationContext } from '@services/moderation-reports/post-moderation-context-attach'
import { decodeCommunityModerationQueueCursor } from './moderation-queue-cursor.mts'
import { buildCommunityReportQueueQuery } from './moderation-queue-report-sql.mts'
import {
  buildCommunityAutomodFlagQueueQuery,
  buildCommunityReviewQueueQuery,
} from './moderation-queue-review-sql.mts'
export { encodeCommunityModerationQueueCursor } from './moderation-queue-cursor.mts'

export type CommunityModerationQueueSource = 'report' | 'community_review' | 'automod_flag'

export type CommunityModerationQueueEntry = PendingModerationReport & {
  queue_source: CommunityModerationQueueSource
  /** Kept explicit so API-contract extraction retains the JSON object rather than its SQL origin. */
  target_content: ModerationReportTargetContent | null
  /** True for private/followers-only targets; the route masks these for member-tier viewers. */
  target_is_restricted: boolean
  /** True when the target post was submitted anonymously; used to redact target_user_id
   * for non-site-staff viewers so the author UUID is not exposed. */
  target_is_anonymous: boolean
}

export type SearchCommunityModerationQueueOptions = {
  status?: ModerationReportStatus
  limit?: number
  after?: string | null
  /** Return only this queue source; every permitted source when omitted. */
  source?: CommunityModerationQueueSource
  /**
   * Whether to include the moderator-only sources: pre-publication `community_post_reviews`
   * rows (unpublished post titles/paths) and open automod flags (a moderation signal).
   */
  includeModeratorSources?: boolean
  /** Viewer tier for post_moderation_context: moderators get full context; members get coarse. */
  viewerTier?: 'moderator' | 'member'
}

export type CommunityModerationQueueResult = {
  entries: CommunityModerationQueueEntry[]
  hasNextPage: boolean
}

/**
 * Returns a UNION of community moderation reports, pending `community_post_reviews` rows and
 * open automod flags, ordered by created_at DESC. Member-tier viewers receive a redacted result set.
 */
export async function searchCommunityModerationQueue(
  communityId: string,
  options: SearchCommunityModerationQueueOptions,
): Promise<CommunityModerationQueueResult> {
  const {
    status = 'pending',
    limit: rawLimit = 50,
    after,
    source,
    includeModeratorSources = true,
    viewerTier = 'moderator',
  } = options
  const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

  const decoded = after ? decodeCommunityModerationQueueCursor(after) : null
  const afterCreatedAt = decoded?.afterCreatedAt ?? null
  const afterId = decoded?.afterId ?? null

  const wants = (candidate: CommunityModerationQueueSource) =>
    source === undefined || source === candidate
  const parts: SQLStatement[] = []
  if (wants('report')) parts.push(buildCommunityReportQueueQuery(communityId, status))
  // Reviews expose unpublished post titles/paths and flags are moderation signals; moderator only.
  if (includeModeratorSources && wants('community_review')) {
    parts.push(buildCommunityReviewQueueQuery(communityId))
  }
  if (includeModeratorSources && wants('automod_flag')) {
    parts.push(buildCommunityAutomodFlagQueueQuery(communityId))
  }
  if (parts.length === 0) return { entries: [], hasNextPage: false }

  const unionQuery = sql`/* searchCommunityModerationQueue */
    SELECT * FROM (`
  for (const [index, part] of parts.entries()) {
    if (index > 0) unionQuery.append(sql` UNION ALL `)
    unionQuery.append(part)
  }
  unionQuery.append(sql`) combined`)

  if (afterCreatedAt && afterId) {
    unionQuery.append(
      sql` WHERE (created_at, id) < (${afterCreatedAt}::timestamptz, ${afterId}::uuid)`,
    )
  }

  unionQuery.append(sql` ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(unionQuery)
  const hasNextPage = rows.length > limit
  // Soft-deleted report targets render as "[deleted content]" with no dead links,
  // matching the global queue (applyDeletedTargetLabel preserves the queue_source field).
  const pageRows = hasNextPage
    ? (rows as CommunityModerationQueueEntry[]).slice(0, limit)
    : (rows as CommunityModerationQueueEntry[])
  const labelled = pageRows.map(row => ({
    ...applyDeletedTargetLabel(row),
    queue_source: row.queue_source,
    target_is_restricted: row.target_is_restricted,
    target_is_anonymous: row.target_is_anonymous,
  }))
  const withJudgements = await attachJudgements(labelled)
  const contextTier = viewerTier === 'moderator' ? 'staff' : 'public'
  const entries = await attachPostModerationContext(withJudgements, contextTier)
  return { entries, hasNextPage }
}
