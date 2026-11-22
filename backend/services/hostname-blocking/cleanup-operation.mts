import { write } from '@data-stores/psql'
import type {
  HostnameBlockCleanupCursor,
  HostnameBlockCleanupData,
} from '@queues/background/enqueues/hostname-blocking-jobs'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import { cleanupOperationFields } from './cleanup-operation-fields.mts'
import { v7 as uuidv7 } from 'uuid'
import {
  attachHostnameBlockToAncestorCleanup,
  lockPendingAncestorHostnameBlockCleanup,
} from './cleanup-operation-ancestor.mts'

export type HostnameBlockCleanupOperation = {
  blockId: string
  hostnameId: string
  hostname: string
  blockedById: string | null
  blockedSource: string
  penalizeCreators: boolean
  progress: number
  stage: HostnameBlockCleanupCursor['stage']
  resumeAfter: string | null
  blockedHostnameCount: number
  softDeletedRelationCount: number
  penalizedUserCount: number
  completedAt: Date | null
}

export type HostnameBlockCleanupPosition = HostnameBlockCleanupData

export async function ensureHostnameBlockCleanupOperation(
  query: TransactionQuery,
  hostnameId: string,
  hostname: string,
  blockedById: string,
  blockedSource: string,
  penalizeCreators: boolean,
): Promise<HostnameBlockCleanupOperation> {
  // The target hostname UPDATE already serializes admissions for this hostname.
  // Read the linked root in the same snapshot in case retention retires a lifted root.
  const attachedRoot = sql`(
    SELECT relation_cleanup_root_block_id FROM url_hostname_blocks
    WHERE url_hostname_id = ${hostnameId} AND lifted_at IS NULL
      AND domain_blocklist_source_id IS NULL AND relation_cleanup_root_block_id IS NOT NULL
    ORDER BY id LIMIT 1
  )`
  const { rows: attachedRows } = await query<HostnameBlockCleanupOperation>(
    cleanupOperationSql(attachedRoot),
  )
  if (attachedRows[0]) return attachedRows[0]

  const { rows: existingRows } = await query<{ id: string }>(
    sql`/* ensureHostnameBlockCleanupOperation:findExisting */
      SELECT id FROM url_hostname_blocks
      WHERE url_hostname_id = ${hostnameId} AND lifted_at IS NULL
        AND domain_blocklist_source_id IS NULL AND relation_cleanup_root_block_id IS NULL
      ORDER BY id LIMIT 1 FOR UPDATE`,
  )
  const existing = existingRows[0]
  const ancestor = await lockPendingAncestorHostnameBlockCleanup(query, hostname)
  if (
    ancestor &&
    ancestor.stage === 'subdomains' &&
    ancestor.penalizeCreators === penalizeCreators
  ) {
    return attachHostnameBlockToAncestorCleanup(query, {
      existingBlockId: existing?.id ?? null,
      hostnameId,
      blockedById,
      blockedSource,
      rootBlockId: ancestor.id,
    })
  }
  if (existing) {
    const { rows } = await query<HostnameBlockCleanupOperation>(
      sql`/* ensureHostnameBlockCleanupOperation:attachExisting */
        UPDATE url_hostname_blocks AS block
        SET relation_cleanup_root_block_id = id,
          should_penalize_relation_creators = ${penalizeCreators},
          relation_cleanup_blocked_hostname_count = 1
        WHERE id = ${existing.id} AND relation_cleanup_root_block_id IS NULL
        RETURNING `.append(cleanupOperationFields(sql`${hostname}::text`)),
    )
    if (!rows[0]) throw new Error('Hostname block cleanup operation was not attached')
    return rows[0]
  }

  const blockId = uuidv7()
  const { rows } = await query<HostnameBlockCleanupOperation>(
    sql`/* ensureHostnameBlockCleanupOperation:insert */
      INSERT INTO url_hostname_blocks AS block (
        id, url_hostname_id, blocked_by_id, blocked_source,
        relation_cleanup_root_block_id, should_penalize_relation_creators,
        relation_cleanup_blocked_hostname_count
      ) VALUES (
        ${blockId}, ${hostnameId}, ${blockedById}, ${blockedSource},
        ${blockId}, ${penalizeCreators}, 1
      )
      RETURNING `.append(cleanupOperationFields(sql`${hostname}::text`)),
  )
  if (!rows[0]) throw new Error('Hostname block cleanup operation is missing')
  return rows[0]
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

function cleanupOperationSql(blockId: string | SQLStatement) {
  return sql`/* hostnameBlockCleanupOperation */
    SELECT `
    .append(cleanupOperationFields(sql`hostname.hostname`))
    .append(sql`
    FROM url_hostname_blocks block
    JOIN url_hostnames hostname ON hostname.id = block.url_hostname_id
    WHERE block.id = `)
    .append(typeof blockId === 'string' ? sql`${blockId}` : blockId).append(sql`
      AND block.relation_cleanup_root_block_id = block.id`)
}
