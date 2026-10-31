/* oxlint-disable no-await-in-loop -- each bounded keyset page commits before the next position. */
import { beginTransaction } from '@data-stores/psql'
import { reconsiderChangedPost } from './cleanup-agent-moderation-hash-work.mts'
import { deleteAgentModerationRetentionPage } from './delete-agent-moderation-retention-page.mts'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const AGENT_MODERATION_RETENTION_DAYS = 90

export type AgentModerationCleanupContinuation = {
  afterDueAt: string
  afterId: string
  afterPostId: string
  upperBoundDueAt: string
  upperBoundId: string
}

type CleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  upperBoundDate?: Date
  continuation?: AgentModerationCleanupContinuation
}

export type AgentModerationCleanupResult = {
  scanned: number
  deleted: number
  hasMore: boolean
  continuation: AgentModerationCleanupContinuation | null
}

export async function cleanupObsoleteAgentModerations(
  options: CleanupOptions,
): Promise<AgentModerationCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  const cutoffId = getMinUUIDv7ForDate(getRetentionCutoffDate(AGENT_MODERATION_RETENTION_DAYS, now))
  const lowerBoundId = options.lowerBoundDate
    ? getMinUUIDv7ForDate(options.lowerBoundDate)
    : ZERO_UUID
  const lowerBoundDueAt = options.lowerBoundDate
    ? new Date(options.lowerBoundDate.getTime() + AGENT_MODERATION_RETENTION_DAYS * 86_400_000)
    : new Date(0)
  const upperBoundId = options.upperBoundDate
    ? getMinUUIDv7ForDate(options.upperBoundDate)
    : cutoffId
  const requestedUpperBoundId = upperBoundId < cutoffId ? upperBoundId : cutoffId
  const sweepUpperBoundId = options.continuation?.upperBoundId ?? requestedUpperBoundId
  const requestedUpperBoundDueAt = options.upperBoundDate
    ? new Date(
        Math.min(
          now.getTime(),
          options.upperBoundDate.getTime() + AGENT_MODERATION_RETENTION_DAYS * 86_400_000,
        ),
      ).toISOString()
    : now.toISOString()
  const sweepUpperBoundDueAt = options.continuation?.upperBoundDueAt ?? requestedUpperBoundDueAt
  let afterDueAt = options.continuation?.afterDueAt ?? lowerBoundDueAt.toISOString()
  let afterId = options.continuation?.afterId ?? ZERO_UUID
  let afterPostId = options.continuation?.afterPostId ?? ZERO_UUID
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each bounded page depends on the previous committed due-keyset position; maxBatches and batchSize cap all reads and writes
    const page = await cleanupAgentModerationPage(
      batchSize,
      lowerBoundId,
      lowerBoundDueAt,
      sweepUpperBoundId,
      sweepUpperBoundDueAt,
      afterDueAt,
      afterId,
      afterPostId,
    )
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!page.continuation) break
    afterDueAt = page.continuation.afterDueAt
    afterId = page.continuation.afterId
    afterPostId = page.continuation.afterPostId
  }
  return {
    scanned,
    deleted,
    hasMore,
    continuation: hasMore
      ? {
          afterDueAt,
          afterId,
          afterPostId,
          upperBoundDueAt: sweepUpperBoundDueAt,
          upperBoundId: sweepUpperBoundId,
        }
      : null,
  }
}

async function cleanupAgentModerationPage(
  batchSize: number,
  lowerBoundId: string,
  lowerBoundDueAt: Date,
  upperBoundId: string,
  upperBoundDueAt: string,
  afterDueAt: string,
  afterId: string,
  afterPostId: string,
): Promise<AgentModerationCleanupResult> {
  await using transaction = await beginTransaction()
  const dirty = await reconsiderChangedPost(transaction, batchSize)
  // Woken work may sort before this continuation's last candidate. A dirty-post page
  // restarts the due keyset; previously visited candidates were deleted or blocked.
  const pageAfterDueAt = dirty.processed ? lowerBoundDueAt.toISOString() : afterDueAt
  const pageAfterId = dirty.processed ? ZERO_UUID : afterId
  const pageAfterPostId = dirty.processed ? ZERO_UUID : afterPostId
  const { rows: candidates } = await transaction<{
    id: string
    post_id: string
    retention_due_at: Date
  }>(
    `/* listAgentModerationCleanupCandidates */
     -- no-mistakes-disable-next-line postgres-required-predicates: a partial due-work index bounds the page across partitions; every mutation below restricts post_id
     SELECT id, post_id, retention_due_at FROM agent_moderations moderation
     WHERE retention_due_at >= $1::timestamptz
       AND retention_due_at <= $2::timestamptz
       AND id >= $3::uuid AND id < $4::uuid
       AND (retention_due_at, id, post_id) > ($5::timestamptz, $6::uuid, $7::uuid)
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
    ],
  )
  const page = candidates.slice(0, batchSize)
  if (page.length > 0) {
    // Serialize with post hash writes before locking source rows and checking eligibility.
    await transaction(
      `/* lockAgentModerationCleanupPosts */
       SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE`,
      [[...new Set(page.map(row => row.post_id))].toSorted()],
    )
    await transaction(
      `/* lockAgentModerationCleanupSources */
       SELECT moderation.id, moderation.post_id FROM agent_moderations moderation
       JOIN unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
         ON moderation.id = page.id AND moderation.post_id = page.post_id
       ORDER BY moderation.id, moderation.post_id FOR UPDATE OF moderation`,
      [page.map(row => row.id), page.map(row => row.post_id)],
    )
  }
  const deleted =
    page.length > 0
      ? await deleteAgentModerationRetentionPage(transaction, page, upperBoundId, upperBoundDueAt)
      : 0
  await transaction.commit()
  const last = page.at(-1)
  const hasMore = candidates.length > batchSize || dirty.hasMore
  return {
    scanned: page.length,
    deleted,
    hasMore,
    continuation: hasMore
      ? {
          afterDueAt: last?.retention_due_at.toISOString() ?? pageAfterDueAt,
          afterId: last?.id ?? pageAfterId,
          afterPostId: last?.post_id ?? pageAfterPostId,
          upperBoundDueAt,
          upperBoundId,
        }
      : null,
  }
}
