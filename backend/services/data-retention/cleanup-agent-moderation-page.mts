import { beginTransaction } from '@data-stores/psql'
import { reconsiderChangedPost } from './cleanup-agent-moderation-hash-work.mts'
import { deleteAgentModerationRetentionPage } from './delete-agent-moderation-retention-page.mts'
import { reconcileAgentModerationRetentionPage } from './reconcile-agent-moderation-retention-page.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

export type AgentModerationCleanupContinuation = {
  afterDueAt: string
  afterId: string
  afterPostId: string
  upperBoundDueAt: string
  upperBoundId: string
}

export type AgentModerationCleanupResult = {
  /** Candidates checked for retention. */
  scanned: number
  deleted: number
  hasMore: boolean
  continuation: AgentModerationCleanupContinuation | null
}

type CandidateKey = { id: string; post_id: string }
type Candidate = CandidateKey & {
  retention_due_at: Date
  retention_blocked_reason: 'reconcile' | 'check_newest' | null
}

export async function cleanupAgentModerationPage(
  batchSize: number,
  lowerBoundId: string,
  lowerBoundDueAt: Date,
  upperBoundId: string,
  upperBoundDueAt: string,
  afterDueAt: string,
  afterId: string,
  afterPostId: string,
  postIds?: readonly string[],
): Promise<AgentModerationCleanupResult> {
  const { candidates, position, moreHashWork } = await prepareAgentModerationCleanupPage(
    batchSize,
    lowerBoundId,
    lowerBoundDueAt,
    upperBoundId,
    upperBoundDueAt,
    afterDueAt,
    afterId,
    afterPostId,
    postIds,
  )
  const page = candidates.slice(0, batchSize)
  const pending = page.filter(row => row.retention_blocked_reason !== null)
  const wokenIds = pending.length > 0 ? await reconcileAgentModerationRetentionPage(pending) : []
  const { deleted, checkNewest } =
    page.length > 0
      ? await drainAgentModerationCleanupPage(page, upperBoundId, upperBoundDueAt)
      : { deleted: 0, checkNewest: false }
  // A woken predecessor or a deferred keeper check can sort before this page's position.
  const rewind = checkNewest || wokenIds.some(id => id >= lowerBoundId && id < upperBoundId)
  const hasMore = candidates.length > batchSize || moreHashWork || rewind
  const last = page.at(-1)
  return {
    scanned: page.length,
    deleted,
    hasMore,
    continuation: hasMore
      ? {
          afterDueAt: rewind
            ? lowerBoundDueAt.toISOString()
            : (last?.retention_due_at.toISOString() ?? position.afterDueAt),
          afterId: rewind ? ZERO_UUID : (last?.id ?? position.afterId),
          afterPostId: rewind ? ZERO_UUID : (last?.post_id ?? position.afterPostId),
          upperBoundDueAt,
          upperBoundId,
        }
      : null,
  }
}

async function prepareAgentModerationCleanupPage(
  batchSize: number,
  lowerBoundId: string,
  lowerBoundDueAt: Date,
  upperBoundId: string,
  upperBoundDueAt: string,
  afterDueAt: string,
  afterId: string,
  afterPostId: string,
  postIds?: readonly string[],
) {
  await using transaction = await beginTransaction()
  const dirty = await reconsiderChangedPost(transaction, batchSize, postIds)
  // Woken work may sort before this continuation's last candidate. A dirty-post page
  // restarts the due keyset; previously visited candidates were deleted or blocked.
  const pageAfterDueAt = dirty.processed ? lowerBoundDueAt.toISOString() : afterDueAt
  const pageAfterId = dirty.processed ? ZERO_UUID : afterId
  const pageAfterPostId = dirty.processed ? ZERO_UUID : afterPostId
  const { rows: candidates } = await transaction<Candidate>(
    `/* listAgentModerationCleanupCandidates */
     -- no-mistakes-disable-next-line postgres-required-predicates: a partial due-work index bounds the page across partitions; every mutation below restricts post_id
     SELECT id, post_id, retention_due_at, retention_blocked_reason FROM agent_moderations
     WHERE retention_due_at >= $1::timestamptz
       AND retention_due_at <= $2::timestamptz
       AND id >= $3::uuid AND id < $4::uuid
       AND (retention_due_at, id, post_id) > ($5::timestamptz, $6::uuid, $7::uuid)${postIds ? '\n       AND post_id = ANY($9::uuid[])' : ''}
     ORDER BY retention_due_at, id, post_id LIMIT $8`,
    [
      lowerBoundDueAt,
      upperBoundDueAt,
      lowerBoundId,
      upperBoundId,
      pageAfterDueAt,
      pageAfterId,
      pageAfterPostId,
      batchSize + 1,
      ...(postIds ? [postIds] : []),
    ],
  )
  await transaction.commit()
  return {
    candidates,
    position: { afterDueAt: pageAfterDueAt, afterId: pageAfterId, afterPostId: pageAfterPostId },
    moreHashWork: dirty.hasMore,
  }
}

async function drainAgentModerationCleanupPage(
  page: readonly CandidateKey[],
  upperBoundId: string,
  upperBoundDueAt: string,
) {
  await using transaction = await beginTransaction()
  const { rows: locked } = await transaction<CandidateKey>(
    `/* lockAgentModerationCleanupSources */
     SELECT moderation.id, moderation.post_id FROM agent_moderations moderation
     JOIN unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
       ON moderation.id = page.id AND moderation.post_id = page.post_id
     WHERE moderation.retention_due_at IS NOT NULL AND moderation.retention_blocked_reason IS NULL
     ORDER BY moderation.id, moderation.post_id FOR UPDATE OF moderation`,
    [page.map(row => row.id), page.map(row => row.post_id)],
  )
  // A source skipped while pending can become plain due after this lock statement.
  const result =
    locked.length > 0
      ? await deleteAgentModerationRetentionPage(transaction, locked, upperBoundId, upperBoundDueAt)
      : { deleted: 0, checkNewest: false }
  await transaction.commit()
  return result
}
