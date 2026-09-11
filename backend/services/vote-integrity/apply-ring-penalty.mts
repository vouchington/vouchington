import { assertWhitelistedSqlIdentifier, read, beginTransaction } from '@data-stores/psql'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { enqueueBulkRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { ENTITY_VOTE_TABLES, FLAG_ENTITY_FK_COLUMNS } from './config.mts'
import type { VoteIntegrityFlag } from './create-flag.mts'
import { insertVoteWeightPenalty } from './insert-vote-weight-penalty.mts'
import { VOTE_INTEGRITY_FLAG_TARGET_PROJECTION } from './flag-projection.mts'

type ApplyRingPenaltyResult = {
  penalized_user_count: number
}

export async function applyVoteRingPenalty(
  flagId: string,
  adminUserId: string,
): Promise<ApplyRingPenaltyResult> {
  // Load the flag to determine the entity
  const flagQuery = sql`/* applyVoteRingPenalty_getFlag */
    SELECT `
  flagQuery.append(VOTE_INTEGRITY_FLAG_TARGET_PROJECTION)
  flagQuery.append(sql`
    FROM vote_integrity_flags
    WHERE id = ${flagId}
  `)
  const { rows: flagRows } = await read(flagQuery)

  const flag = flagRows[0] as
    | Omit<
        VoteIntegrityFlag,
        | 'id'
        | 'flag_type'
        | 'details'
        | 'resolved_at'
        | 'resolved_by_id'
        | 'resolution'
        | 'created_at'
      >
    | undefined
  if (!flag) throw createHttpError(404, 'Vote integrity flag not found')

  // Find which FK column is set and look up the vote table
  let entityId: string | null = null
  let entityType: string | null = null
  for (const col of FLAG_ENTITY_FK_COLUMNS) {
    const val = flag[col]
    if (val !== null) {
      entityId = val
      entityType = col.replace(/_id$/, '')
      break
    }
  }

  if (!entityId || !entityType) throw createHttpError(500, 'Flag has no entity FK set')

  const tableConfig = ENTITY_VOTE_TABLES[entityType]
  if (!tableConfig)
    throw createHttpError(500, `No vote table configured for entity type: ${entityType}`)

  await using query = await beginTransaction()
  // Get current upvoters: DISTINCT ON to get latest vote per user, filter score > 0
  const usersQuery = sql`/* applyVoteRingPenalty_getUsers */
      SELECT DISTINCT ON (user_id) user_id, score
      FROM `
  usersQuery.append(
    assertWhitelistedSqlIdentifier(tableConfig.voteTable, VOTE_TABLE_IDENTIFIERS, 'voteTable'),
  )
  usersQuery.append(sql`
      WHERE `)
  usersQuery.append(
    assertWhitelistedSqlIdentifier(
      tableConfig.entityIdColumn,
      VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
      'entityIdColumn',
    ),
  )
  usersQuery.append(sql` = ${entityId}::uuid
      ORDER BY user_id, id DESC
    `)

  const { rows: allRows } = await query(usersQuery)

  // Filter to current upvoters (score > 0)
  const upvoterIds = (allRows as Array<{ user_id: string; score: number }>).flatMap(r =>
    r.score > 0 ? [r.user_id] : [],
  )

  const userIds =
    upvoterIds.length === 0
      ? []
      : await insertVoteWeightPenalty({
          userIds: upvoterIds,
          reason: 'voting_ring',
          sourceFlagId: flagId,
          createdById: adminUserId,
          query,
          enqueueRecalculation: false,
        })
  await query.commit()

  if (userIds.length > 0) {
    void enqueueBulkRecalculateUserVoteWeight(userIds, true)
  }

  return { penalized_user_count: userIds.length }
}
