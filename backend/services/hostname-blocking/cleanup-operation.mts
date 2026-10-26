import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export type HostnameBlockCleanupOperation = {
  blockId: string
  hostnameId: string
  hostname: string
  blockedById: string | null
  blockedSource: string
  penalizeCreators: boolean
  progress: number
  blockedHostnameCount: number
  softDeletedRelationCount: number
  penalizedUserCount: number
  completedAt: Date | null
}

export type HostnameBlockCleanupPosition = Pick<
  HostnameBlockCleanupOperation,
  'blockId' | 'progress'
>

type HostnameBlockOperationTotals = {
  blocked_hostname_count: number
  soft_deleted_relation_count: number
  penalized_user_count: number
}

export type HostnameBlockOperationResult = { operation_id: string } & (
  | { status: 'pending'; totals: null }
  | { status: 'completed'; totals: HostnameBlockOperationTotals }
)

export function toHostnameBlockOperationResult(
  operation: HostnameBlockCleanupOperation,
): HostnameBlockOperationResult {
  if (!operation.completedAt) {
    return { operation_id: operation.blockId, status: 'pending', totals: null }
  }
  return {
    operation_id: operation.blockId,
    status: 'completed',
    totals: {
      blocked_hostname_count: operation.blockedHostnameCount,
      soft_deleted_relation_count: operation.softDeletedRelationCount,
      penalized_user_count: operation.penalizedUserCount,
    },
  }
}

export async function ensureHostnameBlockCleanupOperation(
  query: TransactionQuery,
  hostnameId: string,
  blockedById: string,
  blockedSource: string,
  penalizeCreators: boolean,
): Promise<HostnameBlockCleanupOperation> {
  const { rows: existingRows } = await query<{
    id: string
    relation_cleanup_root_block_id: string | null
  }>(sql`/* ensureHostnameBlockCleanupOperation:findExisting */
    SELECT id, relation_cleanup_root_block_id FROM url_hostname_blocks
    WHERE url_hostname_id = ${hostnameId} AND lifted_at IS NULL
      AND domain_blocklist_source_id IS NULL
    ORDER BY (relation_cleanup_root_block_id IS NULL), id LIMIT 1 FOR UPDATE
  `)
  const existing = existingRows[0]
  if (existing?.relation_cleanup_root_block_id) {
    const operation = await lockHostnameBlockCleanupOperation(
      query,
      existing.relation_cleanup_root_block_id,
    )
    if (!operation) throw new Error('Hostname block cleanup root is missing')
    return operation
  }
  if (existing) {
    const { rows } = await query<{ id: string }>(
      sql`/* ensureHostnameBlockCleanupOperation:attachExisting */
        UPDATE url_hostname_blocks
        SET relation_cleanup_root_block_id = id,
          should_penalize_relation_creators = ${penalizeCreators},
          relation_cleanup_blocked_hostname_count = 1
        WHERE id = ${existing.id} AND relation_cleanup_root_block_id IS NULL
        RETURNING id
      `,
    )
    if (!rows[0]) throw new Error('Hostname block cleanup operation was not attached')
    const operation = await lockHostnameBlockCleanupOperation(query, existing.id)
    if (!operation) throw new Error('Hostname block cleanup operation is missing')
    return operation
  }

  const blockId = uuidv7()
  await query(
    sql`/* ensureHostnameBlockCleanupOperation:insert */
      INSERT INTO url_hostname_blocks (
        id, url_hostname_id, blocked_by_id, blocked_source,
        relation_cleanup_root_block_id, should_penalize_relation_creators,
        relation_cleanup_blocked_hostname_count
      ) VALUES (
        ${blockId}, ${hostnameId}, ${blockedById}, ${blockedSource},
        ${blockId}, ${penalizeCreators}, 1
      )
    `,
  )
  const operation = await lockHostnameBlockCleanupOperation(query, blockId)
  if (!operation) throw new Error('Hostname block cleanup operation is missing')
  return operation
}

export async function getHostnameBlockCleanupOperation(
  blockId: string,
): Promise<HostnameBlockCleanupOperation | null> {
  const { rows } = await write<HostnameBlockCleanupOperation>(cleanupOperationSql(blockId))
  return rows[0] ?? null
}

export async function getHostnameBlockCleanupOperationInTransaction(
  query: TransactionQuery,
  blockId: string,
): Promise<HostnameBlockCleanupOperation | null> {
  const { rows } = await query<HostnameBlockCleanupOperation>(cleanupOperationSql(blockId))
  return rows[0] ?? null
}

export async function lockHostnameBlockCleanupOperation(
  query: TransactionQuery,
  blockId: string,
): Promise<HostnameBlockCleanupOperation | null> {
  const statement = cleanupOperationSql(blockId)
  statement.append(sql` FOR UPDATE OF block`)
  const { rows } = await query<HostnameBlockCleanupOperation>(statement)
  return rows[0] ?? null
}

export async function advanceHostnameBlockCleanupProgress(
  query: TransactionQuery,
  blockId: string,
  expectedProgress: number,
  deltas: {
    blockedHostnameCount?: number
    softDeletedRelationCount?: number
    penalizedUserCount?: number
  } = {},
): Promise<HostnameBlockCleanupOperation | null> {
  const { rows } = await query<HostnameBlockCleanupOperation>(
    sql`/* advanceHostnameBlockCleanupProgress */
      UPDATE url_hostname_blocks block
      SET relation_cleanup_progress = relation_cleanup_progress + 1,
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
        block.relation_cleanup_blocked_hostname_count AS "blockedHostnameCount",
        block.relation_cleanup_soft_deleted_relation_count AS "softDeletedRelationCount",
        block.relation_cleanup_penalized_user_count AS "penalizedUserCount",
        block.relation_cleanup_completed_at AS "completedAt"
    `,
  )
  return rows[0] ?? null
}

function cleanupOperationSql(blockId: string) {
  return sql`/* hostnameBlockCleanupOperation */
    SELECT block.id AS "blockId", block.url_hostname_id AS "hostnameId",
      hostname.hostname, block.blocked_by_id AS "blockedById",
      block.blocked_source AS "blockedSource",
      block.should_penalize_relation_creators AS "penalizeCreators",
      block.relation_cleanup_progress AS progress,
      block.relation_cleanup_blocked_hostname_count AS "blockedHostnameCount",
      block.relation_cleanup_soft_deleted_relation_count AS "softDeletedRelationCount",
      block.relation_cleanup_penalized_user_count AS "penalizedUserCount",
      block.relation_cleanup_completed_at AS "completedAt"
    FROM url_hostname_blocks block
    JOIN url_hostnames hostname ON hostname.id = block.url_hostname_id
    WHERE block.id = ${blockId} AND block.relation_cleanup_root_block_id = block.id`
}
