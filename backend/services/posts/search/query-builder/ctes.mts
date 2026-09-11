import sql, { type SQLStatement } from 'sql-template-strings'
import pgvector from 'pgvector/pg'
import { buildEmbeddingCtes } from '@modules/search-utils'
import { buildExcludedCTE, buildExcludedHostnameIdsCTE } from '@modules/feed-query-builders'
import type { PostSearchOptions } from '../types.mts'
import { MAX_CANONICAL_CHAIN_DEPTH } from './constants.mts'

export function buildPostSearchCtes({
  exclude_for_user_id,
  hasSemanticSearch,
  hasTextSearch,
  semanticSearchEmbedding,
  similar_post_id,
  similar_rss_feed_item_id,
  similar_topic_id,
  text_search_query,
  url_id,
}: PostSearchOptions & {
  hasSemanticSearch: boolean
  hasTextSearch: boolean
}): SQLStatement[] {
  const ctes: SQLStatement[] = []
  if (url_id) ctes.push(buildCanonicalUrlsCte(url_id))
  if (hasTextSearch) ctes.push(buildTextSearchCte(text_search_query!))
  ctes.push(
    ...buildEmbeddingCtes({
      semanticSearchEmbeddingVector:
        hasSemanticSearch && semanticSearchEmbedding
          ? (pgvector.toSql(semanticSearchEmbedding) ?? undefined)
          : undefined,
      similar_post_id,
      similar_topic_id,
      similar_rss_feed_item_id,
    }),
  )
  if (exclude_for_user_id) {
    ctes.push(buildExcludedUsersCte(exclude_for_user_id))
    ctes.push(buildExcludedTopicsCte(exclude_for_user_id))
    ctes.push(buildExcludedHostnameIdsCTE(exclude_for_user_id))
  }
  return ctes
}

export function appendCtes(query: SQLStatement, ctes: SQLStatement[]): void {
  if (ctes.length === 0) return
  query.append(sql`WITH `)
  ctes.forEach((cte, index) => {
    if (index > 0) query.append(sql`,\n      `)
    query.append(cte)
  })
  query.append(sql`\n    `)
}

function buildCanonicalUrlsCte(urlId: string): SQLStatement {
  return sql`
      canonical_urls AS (
        WITH RECURSIVE url_chain AS (
          SELECT id, canonical_url_id, 0 AS depth
          FROM urls
          WHERE id = ${urlId}

          UNION ALL

          SELECT u.id, u.canonical_url_id, uc.depth + 1
          FROM urls u
          INNER JOIN url_chain uc ON u.id = uc.canonical_url_id
          WHERE uc.canonical_url_id IS NOT NULL
            AND uc.depth < ${MAX_CANONICAL_CHAIN_DEPTH}
        )
        SELECT DISTINCT id
        FROM url_chain
      )
    `
}

function buildTextSearchCte(textSearchQuery: string): SQLStatement {
  return sql`
      text_search_tsquery AS (
        SELECT websearch_to_tsquery('voucha_english', ${textSearchQuery.trim()}) AS tsquery
      )
    `
}

function buildExcludedUsersCte(userId: string): SQLStatement {
  return buildExcludedCTE(
    userId,
    {
      relationTable: 'relation__user__mute__user',
      idColumn: 'user_id',
      cteAlias: 'excluded_users',
    },
    ['relation__user__block__user'],
  )
}

function buildExcludedTopicsCte(userId: string): SQLStatement {
  return buildExcludedCTE(
    userId,
    {
      relationTable: 'relation__user__mute__topic',
      idColumn: 'topic_id',
      cteAlias: 'excluded_topics',
    },
    ['relation__user__block__topic'],
  )
}
