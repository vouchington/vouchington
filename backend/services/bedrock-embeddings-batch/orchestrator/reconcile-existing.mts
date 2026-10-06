import { getEmbeddingReconciliationPageSize } from '@services/bedrock-embeddings/batch/config'
import { beginTransaction, write } from '@data-stores/psql'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import {
  EMBEDDING_COLUMNS,
  EMBEDDING_TABLES,
  EMBEDDINGS_TABLE,
} from '@services/bedrock-embeddings/config'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'

type EmbeddingTable = (typeof EMBEDDING_TABLES)[number]
type ReconciliationTable = 'posts' | 'topics' | 'rss_feed_items'

export type EmbeddingReconciliationPage = {
  updatedIds: string[]
  scannedCount: number
  nextCursor: string | null
}

export type EmbeddingReconciliationOptions = {
  after?: string
  limit?: number
  ids?: readonly string[]
}

export async function copyExistingEmbeddings(
  tableName: ReconciliationTable,
  options: EmbeddingReconciliationOptions = {},
): Promise<EmbeddingReconciliationPage> {
  if (tableName !== 'posts' && tableName !== 'topics' && tableName !== 'rss_feed_items') {
    throw new Error(`Invalid table name: ${tableName}`)
  }
  const configuredPageSize = getEmbeddingReconciliationPageSize()
  const requestedLimit = options.limit ?? configuredPageSize
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new Error('Invalid embedding reconciliation page size')
  }
  const limit = Math.min(requestedLimit, configuredPageSize)
  if (options.ids?.length === 0) return { updatedIds: [], scannedCount: 0, nextCursor: null }
  const scope = `embedding-reconciliation:${tableName}:id-asc`
  const afterId =
    options.after !== undefined
      ? decodeScopedUuidCursor(options.after, scope, 'Invalid embedding reconciliation cursor').id
      : null
  const eligibilitySQL =
    tableName === 'topics'
      ? `AND ${tableName}.deleted_at IS NULL AND ${tableName}.merged_into_topic_id IS NULL`
      : `AND ${tableName}.deleted_at IS NULL`
  const lockClause = copyExistingLockClause(tableName)

  await using query = await beginTransaction()
  const parameters: unknown[] = []
  const cursorClause = afterId ? `AND id > $${parameters.push(afterId)}::uuid` : ''
  const idClause = options.ids ? `AND id = ANY($${parameters.push(options.ids)}::uuid[])` : ''
  const limitParameter = `$${parameters.push(limit)}`

  // The index-compatible candidate page is fixed before cache, deletion, batch-lock,
  // and row-lock checks. Every candidate advances the cursor, even if no copy occurs.
  const { rows: candidates } = await query<{ id: string }>(
    `/* copyExistingEmbeddings candidates */
      SELECT id FROM ${tableName}
      WHERE (
        ${EMBEDDING_COLUMNS.input_sha256} IS NULL
        OR ${EMBEDDING_COLUMNS.input_sha256} != ${EMBEDDING_COLUMNS.content_sha256}
      )
      ${cursorClause}
      ${idClause}
      ORDER BY id
      LIMIT ${limitParameter}`,
    parameters,
  )
  const candidateIds = candidates.map(row => row.id)
  const scannedCount = candidateIds.length
  const nextCursor =
    scannedCount === limit ? encodeScopedUuidCursor(candidateIds[scannedCount - 1]!, scope) : null
  if (scannedCount === 0) {
    await query.commit()
    return { updatedIds: [], scannedCount, nextCursor }
  }

  const { rows: lockedRows } = await query<{ id: string }>(
    `/* copyExistingEmbeddings lockRows */
      SELECT ${tableName}.id
      FROM ${tableName}
      JOIN ${EMBEDDINGS_TABLE} existing
        ON ${tableName}.${EMBEDDING_COLUMNS.content_sha256} = existing.content_sha256
      WHERE (
        ${tableName}.${EMBEDDING_COLUMNS.input_sha256} IS NULL
        OR ${tableName}.${EMBEDDING_COLUMNS.input_sha256} != ${tableName}.${EMBEDDING_COLUMNS.content_sha256}
      )
      AND ${tableName}.id = ANY($1::uuid[])
      ${lockClause}
      ${eligibilitySQL}
      ORDER BY ${tableName}.id
      /* deadlock-safe: SKIP LOCKED plus ORDER BY id */
      FOR UPDATE OF ${tableName} SKIP LOCKED`,
    [candidateIds],
  )
  const lockedIds = lockedRows.map(row => row.id)
  if (lockedIds.length === 0) {
    await query.commit()
    return { updatedIds: [], scannedCount, nextCursor }
  }

  const { rows } = await write<{ id: string }>(
    `/* copyExistingEmbeddings */
      UPDATE ${tableName}
      SET ${EMBEDDING_COLUMNS.input_sha256} = existing.content_sha256,
        ${EMBEDDING_COLUMNS.embedding} = existing.embedding,
        ${EMBEDDING_COLUMNS.created_at} = NOW(),
        ${EMBEDDING_COLUMNS.input_token_count} = existing.input_token_count
      FROM ${EMBEDDINGS_TABLE} existing
      WHERE ${tableName}.${EMBEDDING_COLUMNS.content_sha256} = existing.content_sha256
        AND ${tableName}.id = ANY($1::uuid[])
        AND (
          ${tableName}.${EMBEDDING_COLUMNS.input_sha256} IS NULL
          OR ${tableName}.${EMBEDDING_COLUMNS.input_sha256} != ${tableName}.${EMBEDDING_COLUMNS.content_sha256}
        )
        ${lockClause}
        ${eligibilitySQL}
      RETURNING ${tableName}.id
    `,
    [lockedIds],
    { query },
  )
  const updatedIds = rows.map(row => row.id)

  await query.commit()
  return { updatedIds, scannedCount, nextCursor }
}

export function copyExistingLockClause(tableName: EmbeddingTable): string {
  switch (tableName) {
    case 'topics':
      return `AND NOT ${lockExistsClause('topics', 'topics.id')}`
    case 'posts':
      return `AND NOT ${lockExistsClause('posts', 'posts.id')}`
    case 'rss_feed_items':
      return `AND NOT ${lockExistsClause('rss_feed_items', 'rss_feed_items.id')}`
    case 'crawl_chunks':
      return `AND NOT ${lockExistsClause('crawl_chunks', '(crawl_chunks.crawl_id, crawl_chunks.order_index)')}`
  }
}
