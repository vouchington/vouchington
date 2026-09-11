import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { processAuthorDeletionPublicationBatch } from '@services/post-publication'
import type { UserDeletionPhaseProcessor } from '@services/user-deletions'
import { VOTE_SCHEMA_CONFIGS } from '@data-stores/psql/config-driven/utils/election-schema-config'
import sql from 'sql-template-strings'
import { processUserDeletionAccountDataBatch } from './delete-phase-account-data.mts'
import { processUserDeletionCredentialsBatch } from './delete-phase-credentials.mts'
import { processUserDeletionExternalWork } from './delete-phase-external-work.mts'
import {
  deleteOwnedRows,
  deleteUserSubjectRelationRows,
  withUserDeletionTransaction,
} from './delete-phase-transaction.mts'
import {
  deleteUserEntityRelationVotesBatch,
  recomputeUserDeletionRelationImpactsBatch,
} from './delete-entity-relation-votes-batches.mts'

const voteTables = new Set(VOTE_SCHEMA_CONFIGS.map(config => config.voteTable))
const voteEntityKeyColumns = new Set(VOTE_SCHEMA_CONFIGS.map(config => config.entityIdColumn))
const userRelationTables = new Set(
  entityRelationMetadatum.reduce<string[]>((tables, metadata) => {
    if (metadata.subject_type === 'user') tables.push(metadata.table_name)
    return tables
  }, []),
)

export const processUserDeletionPhaseBatch: UserDeletionPhaseProcessor = async input => {
  switch (input.phase) {
    case 'posts':
      return processPosts(input.userId, input.requestId, input.batchSize)
    case 'votes':
      return processVotes(input.userId, input.requestId, input.batchSize)
    case 'user-relations':
      return processUserRelations(input.userId, input.batchSize)
    case 'credentials':
      return processUserDeletionCredentialsBatch(input.userId, input.batchSize)
    case 'account-data':
      return processUserDeletionAccountDataBatch(input.userId, input.requestId, input.batchSize)
    case 'relation-impacts':
      return processRelationImpacts(input.userId, input.requestId, input.batchSize)
    case 'external-work':
      return processUserDeletionExternalWork(input.requestId, input.processingAttemptId)
    case 'finalize':
      return { hasMore: false }
    default:
      throw new Error(`Unsupported user deletion phase: ${input.phase}`)
  }
}

export { processUserDeletionExternalWork } from './delete-phase-external-work.mts'

async function processPosts(userId: string, requestId: string, batchSize: number) {
  return withUserDeletionTransaction(userId, async query => {
    const { rows } = await query<{
      prior_username: string | null
    }>(sql`/* processUserDeletionPosts:request */
      SELECT prior_username FROM user_deletion_requests WHERE id = ${requestId}
    `)
    const result = await processAuthorDeletionPublicationBatch(
      query,
      userId,
      rows[0]?.prior_username ?? null,
      batchSize,
    )
    return { hasMore: result.hasMore }
  })
}

async function processVotes(userId: string, requestId: string, batchSize: number) {
  return withUserDeletionTransaction(userId, async query => {
    const relationVotes = await deleteUserEntityRelationVotesBatch(
      requestId,
      userId,
      batchSize,
      query,
    )
    if (relationVotes > 0) return { hasMore: true }
    for (const { voteTable, entityIdColumn } of VOTE_SCHEMA_CONFIGS) {
      // oxlint-disable-next-line no-await-in-loop -- process one mutation-backed table page per job.
      const deleted = await deleteOwnedRows(
        query,
        voteTable,
        voteTables,
        'user_id',
        entityIdColumn,
        voteEntityKeyColumns,
        userId,
        batchSize,
      )
      if (deleted > 0) return { hasMore: true }
    }
    return { hasMore: false }
  })
}

async function processUserRelations(userId: string, batchSize: number) {
  return withUserDeletionTransaction(userId, async query => {
    const lists = await query(sql`/* processUserDeletionLists */
      WITH candidates AS (
        SELECT id FROM lists
        WHERE owner_user_id = ${userId} AND removed_at IS NULL
        ORDER BY id LIMIT ${batchSize} FOR UPDATE
      )
      UPDATE lists SET removed_at = CURRENT_TIMESTAMP
      FROM candidates WHERE lists.id = candidates.id
    `)
    if ((lists.rowCount ?? 0) > 0) return { hasMore: true }
    for (const table of userRelationTables) {
      // oxlint-disable-next-line no-await-in-loop -- process one mutation-backed table page per job.
      const deleted = await deleteUserSubjectRelationRows(
        query,
        table,
        userRelationTables,
        userId,
        batchSize,
      )
      if (deleted > 0) return { hasMore: true }
    }
    return { hasMore: false }
  })
}

async function processRelationImpacts(userId: string, requestId: string, batchSize: number) {
  return withUserDeletionTransaction(userId, async query => ({
    hasMore: (await recomputeUserDeletionRelationImpactsBatch(requestId, batchSize, query)) > 0,
  }))
}
