import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { enqueueBulkRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import sql from 'sql-template-strings'
import { DEFAULT_PENALTY_MULTIPLIER } from './config.mts'

type InsertVoteWeightPenaltyOptions = QueryOptions & {
  userIds: string[]
  reason: string
  sourceFlagId?: string
  sourceHostnameId?: string
  sourcePostId?: string
  createdById: string
  enqueueRecalculation?: boolean
}

export async function insertVoteWeightPenalty(
  options: InsertVoteWeightPenaltyOptions,
): Promise<string[]> {
  if (options.userIds.length === 0) return []
  assertAtMostOneSource(options)

  const query = sql`/* insertVoteWeightPenalty */
    INSERT INTO vote_weight_penalties (user_id, penalty_multiplier, reason`
  appendSourceColumn(query, options)
  query.append(sql`, created_by_id)
    SELECT
      unnest(${options.userIds}::uuid[]) AS user_id,
      ${DEFAULT_PENALTY_MULTIPLIER},
      ${options.reason}
  `)
  appendSourceValue(query, options)
  query.append(sql`,
      ${options.createdById}
  `)
  appendConflictOrderBy(query, options)
  appendConflictClause(query, options)
  query.append(sql`
    RETURNING user_id
  `)

  const { rows } = await write<{ user_id: string }>(query, options)
  const insertedUserIds = rows.map(row => row.user_id)
  if (options.enqueueRecalculation !== false && insertedUserIds.length > 0) {
    // No JWT invalidation: vote weight is read live, not cached in session claims.
    void enqueueBulkRecalculateUserVoteWeight(insertedUserIds, true)
  }
  return insertedUserIds
}

function assertAtMostOneSource(options: InsertVoteWeightPenaltyOptions): void {
  const sourceCount = [options.sourceFlagId, options.sourceHostnameId, options.sourcePostId].filter(
    source => source !== undefined,
  ).length
  if (sourceCount > 1) {
    throw new Error('insertVoteWeightPenalty accepts at most one source')
  }
}

function appendSourceColumn(
  query: ReturnType<typeof sql>,
  options: InsertVoteWeightPenaltyOptions,
) {
  if (options.sourceFlagId !== undefined) query.append(sql`, source_flag_id`)
  if (options.sourceHostnameId !== undefined) query.append(sql`, source_hostname_id`)
  if (options.sourcePostId !== undefined) query.append(sql`, source_post_id`)
}

function appendSourceValue(query: ReturnType<typeof sql>, options: InsertVoteWeightPenaltyOptions) {
  if (options.sourceFlagId !== undefined)
    query.append(sql`, ${options.sourceFlagId}::uuid AS source_flag_id`)
  if (options.sourceHostnameId !== undefined)
    query.append(sql`, ${options.sourceHostnameId}::uuid AS source_hostname_id`)
  if (options.sourcePostId !== undefined)
    query.append(sql`, ${options.sourcePostId}::uuid AS source_post_id`)
}

function appendConflictOrderBy(
  query: ReturnType<typeof sql>,
  options: InsertVoteWeightPenaltyOptions,
) {
  if (options.sourceFlagId !== undefined)
    query.append(sql` ORDER BY user_id ASC NULLS LAST, source_flag_id ASC NULLS LAST`)
  if (options.sourceHostnameId !== undefined)
    query.append(sql` ORDER BY user_id ASC NULLS LAST, source_hostname_id ASC NULLS LAST`)
  if (options.sourcePostId !== undefined)
    query.append(sql` ORDER BY user_id ASC NULLS LAST, source_post_id ASC NULLS LAST`)
}

function appendConflictClause(
  query: ReturnType<typeof sql>,
  options: InsertVoteWeightPenaltyOptions,
) {
  if (options.sourceFlagId !== undefined) {
    query.append(sql`
      ON CONFLICT (user_id, source_flag_id)
        WHERE source_flag_id IS NOT NULL AND revoked_at IS NULL
      DO NOTHING
    `)
  } else if (options.sourceHostnameId !== undefined) {
    query.append(sql`
      ON CONFLICT (user_id, source_hostname_id)
        WHERE source_hostname_id IS NOT NULL AND revoked_at IS NULL
      DO NOTHING
    `)
  } else if (options.sourcePostId !== undefined) {
    query.append(sql`
      ON CONFLICT (user_id, source_post_id)
        WHERE source_post_id IS NOT NULL AND revoked_at IS NULL
      DO NOTHING
    `)
  }
}
