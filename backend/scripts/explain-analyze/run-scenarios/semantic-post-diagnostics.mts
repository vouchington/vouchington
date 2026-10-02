import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sql from 'sql-template-strings'
import pgvector from 'pgvector'
import { read } from '@data-stores/psql'
import { appendCtes, buildPostSearchCtes } from '@services/posts/search/query-builder/ctes'
import { appendPostSearchSelectAndJoins } from '@services/posts/search/query-builder/select-and-joins'
import { appendPostSearchWhereClause } from '@services/posts/search/query-builder/where-clause'
import {
  executePostSearchQuery,
  SEMANTIC_POST_SEARCH_SETTINGS,
} from '@services/posts/search/execute-query'
import type { PostSearchOptions } from '@services/posts/search/types'
import { OUTPUT_DIR, seedUser } from '../run-support.mts'

function eligibleQuery(options: PostSearchOptions) {
  const query = sql``
  appendCtes(
    query,
    buildPostSearchCtes({
      ...options,
      hasSemanticSearch: true,
      hasTextSearch: Boolean(options.text_search_query),
    }),
  )
  const context = {
    currentUser: seedUser,
    followingRankExpression: null,
    hasSemanticSearch: true,
    hasTextSearch: Boolean(options.text_search_query),
    options: { ...options, sort: 'new' as const, ranking_lt: undefined, vote_score_lt: undefined },
    rankingScoreExpression: null,
    sort: 'new',
  }
  appendPostSearchSelectAndJoins(query, context)
  appendPostSearchWhereClause(query, context)
  return query
}

/** Exact eligibility has no vector ordering or ANN limit, independently checking the seed. */
export async function inspectSemanticPostSeed(options: PostSearchOptions) {
  const query = sql`/* inspectSemanticPostSeed */ SELECT COUNT(*)::integer AS eligible_count,
    (ARRAY_AGG(id ORDER BY id))[1:50] AS eligible_sample_ids FROM (`
    .append(eligibleQuery(options))
    .append(sql`) eligible`)
  const { rows } = await read<{ eligible_count: number; eligible_sample_ids: string[] | null }>(
    query,
  )
  return rows[0]!
}

/** Failure-only evidence keeps the original production plan and its row-count gate intact. */
export async function recordSemanticPostFailure(
  scenario: string,
  options: PostSearchOptions,
  seed: Awaited<ReturnType<typeof inspectSemanticPostSeed>>,
): Promise<void> {
  const embedding = pgvector.toSql(options.semanticSearchEmbedding!)
  const query = sql`/* recordSemanticPostFailure */ WITH eligible AS MATERIALIZED (`.append(
    eligibleQuery(options),
  ).append(sql`), nearest AS MATERIALIZED (
      SELECT id, bedrock_nova_multimodal_v1_embedding <=> ${embedding}::vector AS distance,
        approved_at, community_id, archived_at, deleted_at, post_type
      FROM posts WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL
      ORDER BY bedrock_nova_multimodal_v1_embedding <=> ${embedding}::vector LIMIT 3000
    ) SELECT nearest.*, EXISTS(SELECT 1 FROM eligible WHERE eligible.id = nearest.id) AS eligible,
      current_setting('hnsw.iterative_scan') AS iterative_scan,
      current_setting('hnsw.ef_search') AS ef_search,
      current_setting('hnsw.max_scan_tuples') AS max_scan_tuples,
      current_setting('plan_cache_mode') AS plan_cache_mode
    FROM nearest ORDER BY distance, id`)
  const { rows } = await executePostSearchQuery(query, true)
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(
    join(OUTPUT_DIR, `semantic-diagnostics-${scenario}.json`),
    JSON.stringify(
      { scenario, seed, settings: SEMANTIC_POST_SEARCH_SETTINGS, nearest: rows },
      null,
      2,
    ),
  )
}
