import type { TransactionQuery } from '@data-stores/psql/types'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupOperation } from './cleanup-operation.mts'

export function cursorResumeAfter(cursor: HostnameBlockCleanupCursor): string | null {
  return (cursor.stage === 'penalties' ? cursor.afterUserId : cursor.afterReversedHostname) ?? null
}

export function resumeCursor(
  operation: Pick<HostnameBlockCleanupOperation, 'stage' | 'resumeAfter'>,
): HostnameBlockCleanupCursor {
  const { stage, resumeAfter } = operation
  if (stage === 'penalties') return { stage, ...(resumeAfter ? { afterUserId: resumeAfter } : {}) }
  return { stage, ...(resumeAfter ? { afterReversedHostname: resumeAfter } : {}) }
}

export async function advanceHostnameBlockCleanupProgress(
  query: TransactionQuery,
  blockId: string,
  expectedProgress: number,
  deltas: {
    blockedHostnameCount?: number
    softDeletedRelationCount?: number
    penalizedUserCount?: number
    next?: HostnameBlockCleanupCursor
  } = {},
): Promise<HostnameBlockCleanupOperation | null> {
  const { rows } = await query<HostnameBlockCleanupOperation>(
    sql`/* advanceHostnameBlockCleanupProgress */
      UPDATE url_hostname_blocks block
      SET relation_cleanup_progress = relation_cleanup_progress + 1,
        relation_cleanup_stage =
          COALESCE(${deltas.next?.stage ?? null}::url_hostname_block_cleanup_stages, relation_cleanup_stage),
        relation_cleanup_resume_after = CASE WHEN ${deltas.next !== undefined}::boolean
          THEN ${deltas.next ? cursorResumeAfter(deltas.next) : null}::text
          ELSE relation_cleanup_resume_after END,
        relation_cleanup_blocked_hostname_count =
          relation_cleanup_blocked_hostname_count + ${deltas.blockedHostnameCount ?? 0},
        relation_cleanup_soft_deleted_relation_count =
          relation_cleanup_soft_deleted_relation_count + ${deltas.softDeletedRelationCount ?? 0},
        relation_cleanup_penalized_user_count =
          relation_cleanup_penalized_user_count + ${deltas.penalizedUserCount ?? 0}
      FROM url_hostnames hostname
      WHERE block.id = ${blockId}
        AND block.relation_cleanup_progress = ${expectedProgress}
        AND block.relation_cleanup_completed_at IS NULL
        AND hostname.id = block.url_hostname_id
      RETURNING block.id AS "blockId", block.url_hostname_id AS "hostnameId",
        hostname.hostname, block.blocked_by_id AS "blockedById",
        block.blocked_source AS "blockedSource",
        block.should_penalize_relation_creators AS "penalizeCreators",
        block.relation_cleanup_progress AS progress,
        block.relation_cleanup_stage AS stage,
        block.relation_cleanup_resume_after AS "resumeAfter",
        block.relation_cleanup_blocked_hostname_count AS "blockedHostnameCount",
        block.relation_cleanup_soft_deleted_relation_count AS "softDeletedRelationCount",
        block.relation_cleanup_penalized_user_count AS "penalizedUserCount",
        block.relation_cleanup_completed_at AS "completedAt"
    `,
  )
  return rows[0] ?? null
}
