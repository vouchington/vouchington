import { recordModeratorAction } from '@services/moderator-actions'
import {
  assertWhitelistedSqlIdentifier,
  registerPostCommitAction,
  runWithTransaction,
  type TransactionQuery,
} from '@data-stores/psql'
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
import { VOTE_INTEGRITY_FLAG_PROJECTION } from './flag-projection.mts'

type ApplyRingPenaltyResult = {
  flag: VoteIntegrityFlag
  penalized_user_count: number
}

export async function applyVoteRingPenalty(
  flagId: string,
  adminUserId: string,
  options: { query?: TransactionQuery } = {},
): Promise<ApplyRingPenaltyResult> {
  return runWithTransaction(options.query, async query => {
    // Load and lock the flag to determine the entity
    const flagQuery = sql`/* applyVoteRingPenalty_getFlag */
    SELECT `
    flagQuery.append(VOTE_INTEGRITY_FLAG_PROJECTION)
    flagQuery.append(sql`
    FROM vote_integrity_flags
    WHERE id = ${flagId}
    FOR UPDATE
  `)
    const { rows: flagRows } = await query<VoteIntegrityFlag>(flagQuery)

    const flag = flagRows[0]
    if (!flag) throw createHttpError(404, 'Vote integrity flag not found')
    if (flag.resolved_at) throw createHttpError(409, 'Vote integrity flag is already resolved')

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
    const resolutionQuery = sql`/* applyVoteRingPenalty_resolveFlag */
    UPDATE vote_integrity_flags
    SET resolved_at = CURRENT_TIMESTAMP, resolved_by_id = ${adminUserId}, resolution = 'penalized'
    WHERE id = ${flagId} AND resolved_at IS NULL
    RETURNING `
    resolutionQuery.append(VOTE_INTEGRITY_FLAG_PROJECTION)
    const { rows: resolvedRows } = await query<VoteIntegrityFlag>(resolutionQuery)
    const resolvedFlag = resolvedRows[0]
    if (!resolvedFlag) throw createHttpError(409, 'Vote integrity flag is already resolved')
    await recordModeratorAction(
      adminUserId,
      {
        actionType: 'vote_integrity_penalty_apply',
        voteIntegrityFlagId: flagId,
        metadata: { after: { penalized_user_count: userIds.length } },
      },
      { query },
    )
    if (userIds.length > 0) {
      registerPostCommitAction(query, async () => {
        void enqueueBulkRecalculateUserVoteWeight(userIds, true)
      })
    }

    return { flag: resolvedFlag, penalized_user_count: userIds.length }
  })
}
