import { beginTransaction, read, readPool } from '@data-stores/psql'
import type { QueryInput, QueryOptions, QueryValues } from '@data-stores/psql/types'
import type pg from 'pg'
import sql from 'sql-template-strings'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { EMBEDDING_DISTANCE_THRESHOLD, applyFilteredVectorScan } from '@modules/search-utils'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { PostType } from '../types.mts'

type SearchPostsSemanticOptions = {
  query: string
  limit?: number
  postType?: PostType
  currentUserId?: string
  isAdministrator?: boolean
}

type SearchPostsSemanticDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
  queryPosts: typeof read
}

export async function queryPostsSemantic<Row extends pg.QueryResultRow = any>(
  input: QueryInput,
  valuesOrOptions?: QueryValues | QueryOptions,
  options: QueryOptions = {},
): Promise<pg.QueryResult<Row>> {
  await using transaction = await beginTransaction({ client: readPool })
  // Tool calls use a small hard-capped result window after moderation filters, so a plain
  // HNSW scan can overfilter below LIMIT — see applyFilteredVectorScan().
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

const defaultSearchPostsSemanticDependencies: SearchPostsSemanticDependencies = {
  getCachedSearchEmbedding,
  queryPosts: queryPostsSemantic,
}

type PostSemanticSearchResult = {
  id: string
  title: string
  markdown: string
  post_type: string
  distance: number
}

type PostSemanticSearchRow = Omit<PostSemanticSearchResult, 'distance'> & {
  distance: string | number
}

export async function toolsSearchPostsSemantic(
  options: SearchPostsSemanticOptions,
  dependencies: Partial<SearchPostsSemanticDependencies> = {},
): Promise<PostSemanticSearchResult[]> {
  const resolvedDependencies = { ...defaultSearchPostsSemanticDependencies, ...dependencies }
  const { query, limit = 5, postType, currentUserId, isAdministrator = false } = options
  const safeLimit = Math.min(Math.max(1, limit), 10)

  // Get embedding for query
  const embedding = await resolvedDependencies.getCachedSearchEmbedding(query)

  const sqlQuery = sql`/* toolsSearchPostsSemantic */
    SELECT
      posts.id,
      posts.title,
      posts.markdown,
      posts.post_type,
      (posts.bedrock_nova_multimodal_v1_embedding <=> ${JSON.stringify(embedding)}::vector) AS distance
    FROM posts
    JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
    WHERE posts.deleted_at IS NULL
      AND posts.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND (posts.bedrock_nova_multimodal_v1_embedding <=> ${JSON.stringify(embedding)}::vector) < ${EMBEDDING_DISTANCE_THRESHOLD}
      AND posts.post_type != 'topic_recommendation'
  `

  // Clearance and audience filters preserve author and administrator access.
  if (currentUserId) {
    sqlQuery.append(sql` AND `).append(
      buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId,
        isAdministrator,
      }),
    )
  } else {
    sqlQuery.append(sql` AND `).append(buildPublicPostEligibilityFilter('posts', 'root_post'))
  }

  if (postType) {
    sqlQuery.append(sql` AND posts.post_type = ${postType}`)
  }

  sqlQuery.append(sql`
    ORDER BY distance ASC, posts.bedrock_nova_multimodal_v1_embedding_created_at DESC, posts.created_at DESC, posts.id ASC
    LIMIT ${safeLimit}
  `)

  const { rows } = await resolvedDependencies.queryPosts<PostSemanticSearchRow>(sqlQuery)

  return Promise.all(
    rows.map(async row => ({
      id: row.id,
      title: await sanitizePromptInjection(row.title, { isTitle: true }),
      markdown: wrapExternalContent(await sanitizePromptInjection(row.markdown), {
        source: 'post',
        contentType: 'user_post',
      }),
      post_type: row.post_type,
      distance: Number(row.distance),
    })),
  )
}
