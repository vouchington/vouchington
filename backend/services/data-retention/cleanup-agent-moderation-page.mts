import { beginTransaction } from '@data-stores/psql'
import { reconsiderChangedPost } from './cleanup-agent-moderation-hash-work.mts'
import { deleteAgentModerationRetentionPage } from './delete-agent-moderation-retention-page.mts'
import {
  repairAgentModerationRetentionPage,
  type AgentModerationRepairPosition,
} from './repair-agent-moderation-retention-page.mts'
import { repairPersistedAgentModerationPage } from './agent-moderation-repair-cursor.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

export type AgentModerationCleanupContinuation = {
  afterDueAt: string
  afterId: string
  afterPostId: string
  upperBoundDueAt: string
  upperBoundId: string
}

export type AgentModerationCleanupResult = {
  /** Candidates checked for deletion, including repaired due rows. */
  scanned: number
  deleted: number
  hasMore: boolean
  continuation: AgentModerationCleanupContinuation | null
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
  repair: AgentModerationRepairPosition | null,
  persistRepair: boolean,
  reserveRepairSlot: boolean,
  postIds?: readonly string[],
): Promise<AgentModerationCleanupResult & { repair: AgentModerationRepairPosition | null }> {
  await using transaction = await beginTransaction()
  const dirty = await reconsiderChangedPost(transaction, batchSize, postIds)
  // The final daily page reserves a slot so a due backlog can't starve repair.
  const dueBudget = batchSize - Number(reserveRepairSlot)
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
      dueBudget + 1,
      ...(postIds ? [postIds] : []),
    ],
  )
  const page = candidates.slice(0, dueBudget)
  if (page.length > 0) {
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
  const moreDue = candidates.length > dueBudget || dirty.hasMore
  const repairBudget = batchSize - page.length
  const repaired =
    repair && (reserveRepairSlot || !moreDue) && repairBudget > 0
      ? persistRepair
        ? await repairPersistedAgentModerationPage(
            transaction,
            repairBudget,
            lowerBoundId,
            upperBoundId,
            upperBoundDueAt,
            postIds,
          )
        : await repairAgentModerationRetentionPage(
            transaction,
            repairBudget,
            repair,
            lowerBoundId,
            upperBoundId,
            upperBoundDueAt,
            postIds,
          )
      : null
  await transaction.commit()
  const last = page.at(-1)
  return {
    scanned: page.length + (repaired?.scanned ?? 0),
    deleted: deleted + (repaired?.deleted ?? 0),
    repair: repaired ? repaired.next : repair,
    hasMore: moreDue,
    continuation: moreDue
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
