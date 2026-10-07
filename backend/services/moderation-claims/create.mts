import { recordModeratorAction } from '@services/moderator-actions'
import createError from 'http-errors'
import { read, write, runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { CLAIM_EXPIRY_MINUTES } from './config.mts'
import type { ModerationQueueClaim, ClaimResult } from './types.mts'
import { assertItemInCommunity } from './scope.mts'

export async function claimModerationQueueItem(
  currentUserId: string,
  options: {
    communityId: string
    reportId?: string | null
    postId?: string | null
    query?: TransactionQuery
  },
): Promise<ClaimResult> {
  const { communityId, reportId, postId } = options
  const hasReport = !!reportId
  const hasPost = !!postId

  if (hasReport === hasPost) {
    throw createError(422, 'Exactly one of reportId or postId must be set')
  }

  await assertItemInCommunity(communityId, { reportId, postId })

  if (hasReport) return claimByReport(currentUserId, communityId, reportId!, options.query)
  return claimByPost(currentUserId, communityId, postId!, options.query)
}

async function claimByReport(
  currentUserId: string,
  communityId: string,
  reportId: string,
  providedQuery?: TransactionQuery,
): Promise<ClaimResult> {
  return runWithTransaction(providedQuery, async query => {
    const { rows } = await query<ModerationQueueClaim>(sql`/* claimModerationQueueItem:report */
    INSERT INTO moderation_queue_claims (community_id, report_id, claimed_by_id, claimed_at)
    VALUES (${communityId}, ${reportId}, ${currentUserId}, now())
    ON CONFLICT (report_id) WHERE report_id IS NOT NULL AND released_at IS NULL
    DO UPDATE SET
      claimed_by_id = EXCLUDED.claimed_by_id,
      claimed_at    = now()
    WHERE moderation_queue_claims.claimed_by_id = EXCLUDED.claimed_by_id
       OR moderation_queue_claims.claimed_at <= now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
    RETURNING id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
  `)

    const result =
      rows.length > 0
        ? { claim: rows[0]!, claimed_by_other: false }
        : await fetchHolderForReport(currentUserId, communityId, reportId, query)
    if (!result.claimed_by_other) {
      await recordModeratorAction(
        currentUserId,
        { actionType: 'report_claim', communityId, reportId },
        { query },
      )
    }
    return result
  })
}

async function fetchHolderForReport(
  currentUserId: string,
  communityId: string,
  reportId: string,
  query: TransactionQuery,
): Promise<ClaimResult> {
  const { rows } = await query<ModerationQueueClaim>(sql`/* claimModerationQueueItem:fetch_holder */
    SELECT id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
    FROM moderation_queue_claims
    WHERE report_id = ${reportId}
      AND released_at IS NULL
      AND claimed_at > now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
    LIMIT 1
  `)

  if (rows.length > 0) return { claim: rows[0]!, claimed_by_other: true }
  /* v8 ignore start -- race: holder released between INSERT conflict and SELECT */
  const { rows: freshRows } =
    await query<ModerationQueueClaim>(sql`/* claimModerationQueueItem:fresh_report */
    INSERT INTO moderation_queue_claims (community_id, report_id, claimed_by_id, claimed_at)
    VALUES (${communityId}, ${reportId}, ${currentUserId}, now())
    ON CONFLICT DO NOTHING
    RETURNING id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
  `)
  if (freshRows.length === 0) throw createError(409, 'Claim was taken concurrently — please retry')
  return { claim: freshRows[0]!, claimed_by_other: false }
  /* v8 ignore stop */
}

async function claimByPost(
  currentUserId: string,
  communityId: string,
  postId: string,
  query?: TransactionQuery,
): Promise<ClaimResult> {
  const { rows } = await write<ModerationQueueClaim>(
    sql`/* claimModerationQueueItem:post */
    INSERT INTO moderation_queue_claims (community_id, post_id, claimed_by_id, claimed_at)
    VALUES (${communityId}, ${postId}, ${currentUserId}, now())
    ON CONFLICT (post_id) WHERE post_id IS NOT NULL AND released_at IS NULL
    DO UPDATE SET
      claimed_by_id = EXCLUDED.claimed_by_id,
      claimed_at    = now()
    WHERE moderation_queue_claims.claimed_by_id = EXCLUDED.claimed_by_id
       OR moderation_queue_claims.claimed_at <= now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
    RETURNING id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
  `,
    { query },
  )

  if (rows.length > 0) return { claim: rows[0]!, claimed_by_other: false }
  return fetchHolderForPost(currentUserId, communityId, postId, query)
}

async function fetchHolderForPost(
  currentUserId: string,
  communityId: string,
  postId: string,
  query?: TransactionQuery,
): Promise<ClaimResult> {
  const { rows } = await read<ModerationQueueClaim>(
    sql`/* claimModerationQueueItem:fetch_holder */
    SELECT id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
    FROM moderation_queue_claims
    WHERE post_id = ${postId}
      AND released_at IS NULL
      AND claimed_at > now() - (${CLAIM_EXPIRY_MINUTES} || ' minutes')::interval
    LIMIT 1
  `,
    { query },
  )

  if (rows.length > 0) return { claim: rows[0]!, claimed_by_other: true }
  /* v8 ignore start -- race: holder released between INSERT conflict and SELECT */
  const { rows: freshRows } = await write<ModerationQueueClaim>(
    sql`/* claimModerationQueueItem:fresh_post */
    INSERT INTO moderation_queue_claims (community_id, post_id, claimed_by_id, claimed_at)
    VALUES (${communityId}, ${postId}, ${currentUserId}, now())
    ON CONFLICT DO NOTHING
    RETURNING id, community_id, report_id, post_id, claimed_by_id, claimed_at, released_at
  `,
    { query },
  )
  if (freshRows.length === 0) throw createError(409, 'Claim was taken concurrently — please retry')
  return { claim: freshRows[0]!, claimed_by_other: false }
  /* v8 ignore stop */
}
