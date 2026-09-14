/**
 * Posts semantic search test helpers
 */

import { beginTransaction, read, write } from '@data-stores/psql'
import type { QueryInput, QueryOptions, QueryValues } from '@data-stores/psql/types'
import type pg from 'pg'
import sql, { type SQLStatement } from 'sql-template-strings'
import { applyFilteredVectorScan } from '@modules/search-utils'
import { isUUID } from '@modules/utils'
import { makeRandomEmbedding } from './embeddings.mts'

/** Hard cap so this helper cannot be used as an unbounded search API. */
export const MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS = 32

/**
 * Reads fixture rows from the primary/write pool (avoids replica-lag invisibility of
 * freshly-written fixtures), applying the same shared vector-scan setting as production
 * (applyFilteredVectorScan) so this helper cannot drift from `toolsSearchPostsSemantic` again —
 * they now differ only by pool (writePool here vs. readPool in production).
 */
export async function queryPostSemanticFixturesFromPrimary<Row extends pg.QueryResultRow = any>(
  input: QueryInput,
  valuesOrOptions?: QueryValues | QueryOptions,
  options?: QueryOptions,
): Promise<pg.QueryResult<Row>> {
  const text = typeof input === 'string' ? input : input.text
  if (!text.includes('/* toolsSearchPostsSemantic */')) {
    throw new Error('Post semantic fixture queries must use toolsSearchPostsSemantic')
  }

  await using transaction = await beginTransaction()
  await applyFilteredVectorScan(transaction)
  const result = isQueryOptions(valuesOrOptions)
    ? await read<Row>(input, { ...valuesOrOptions, query: transaction })
    : await read<Row>(input, valuesOrOptions, { ...options, query: transaction })
  await transaction.commit()
  return result
}

function isQueryOptions(value: unknown): value is QueryOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPostSemanticFixtureScopeIds(ids: string[]): void {
  if (ids.length === 0) {
    throw new Error('fixture post IDs must be a non-empty list')
  }
  if (ids.length > MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS) {
    throw new Error(`fixture post IDs cannot exceed ${MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS} entries`)
  }
  if (!ids.every(id => isUUID(id))) {
    throw new Error('fixture post IDs must contain only valid UUIDs')
  }
}

/**
 * Force PK-first isolation for dirty-DB semantic fixture queries: the production
 * `FROM posts` clause then reads this CTE instead of the full table.
 */
export function scopePostSemanticFixtureQueryToIds(input: QueryInput, ids: string[]): SQLStatement {
  assertPostSemanticFixtureScopeIds(ids)
  const scoped = sql`WITH posts AS MATERIALIZED (
    SELECT * FROM public.posts WHERE id = ANY(${ids}::uuid[])
  )
  `
  scoped.append(input)
  return scoped
}

/**
 * `queryPosts` override for `toolsSearchPostsSemantic` that scopes results to the
 * test's own fixture IDs before the production query runs.
 */
export function queryPostSemanticFixturesScopedToIds(
  ids: string[],
): typeof queryPostSemanticFixturesFromPrimary {
  assertPostSemanticFixtureScopeIds(ids)
  return async function queryPostSemanticFixturesScopedToIdsQuery<
    Row extends pg.QueryResultRow = any,
  >(
    input: QueryInput,
    valuesOrOptions?: QueryValues | QueryOptions,
    options?: QueryOptions,
  ): Promise<pg.QueryResult<Row>> {
    return queryPostSemanticFixturesFromPrimary<Row>(
      scopePostSemanticFixtureQueryToIds(input, ids),
      valuesOrOptions,
      options,
    )
  }
}

/**
 * Reads back the `hnsw.iterative_scan` GUC as seen inside the fixture helper's own transaction,
 * so DB-backed callers can assert it matches production without importing raw SQL themselves.
 */
export async function getPostSemanticFixtureIterativeScanSetting(): Promise<string> {
  const { rows } = await queryPostSemanticFixturesFromPrimary<{ iterative_scan: string }>(
    sql`/* toolsSearchPostsSemantic */ SELECT current_setting('hnsw.iterative_scan') AS iterative_scan`,
  )

  return rows[0].iterative_scan
}

/**
 * Add dummy embedding to a post for semantic search tests
 */
export async function addDummyEmbeddingToPost(
  postId: string,
  options?: {
    flagged?: boolean
    embedding?: number[]
    rankFirst?: boolean
  },
): Promise<void> {
  const vector = options?.embedding ?? makeRandomEmbedding()
  // Create 1024-dimension dummy embedding
  const dummyEmbedding = `[${vector.join(',')}]`

  const query = sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_embedding = ${dummyEmbedding}::vector,
        bedrock_nova_multimodal_v1_embedding_created_at = ${options?.rankFirst ? '9999-01-01T00:00:00Z' : new Date().toISOString()}
  `

  if (options?.flagged) {
    query.append(sql`,
        approved_at = NULL,
        in_review_at = CURRENT_TIMESTAMP
    `)
  }

  query.append(sql`
    WHERE id = ${postId}
  `)

  await write(query)
}

export async function setPostEmbeddingContentSha256KeepingInput(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `)
}
