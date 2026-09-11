import sql, { type SQLStatement } from 'sql-template-strings'
import { EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function appendSearchAndSimilarityFilters(
  filters: SQLStatement[],
  options: PostSearchOptions & {
    hasSemanticSearch: boolean
    hasTextSearch: boolean
  },
): void {
  if (options.hasTextSearch) filters.push(sql`posts.search_vector @@ text_search_tsquery.tsquery`)
  if (options.hasSemanticSearch) appendEmbeddingDistance(filters, 'semantic_search_embedding')
  if (options.similar_post_id) appendSimilarPostFilters(filters, options.similar_post_id)
  if (options.similar_topic_id) appendSimilarTopicFilters(filters, options.similar_topic_id)
  if (options.similar_rss_feed_item_id) {
    appendEmbeddingDistance(filters, 'similar_rss_feed_item_embedding')
  }
}

function appendEmbeddingDistance(filters: SQLStatement[], embeddingCteAlias: string): void {
  filters.push(sql`posts.bedrock_nova_multimodal_v1_embedding IS NOT NULL`)
  filters.push(
    sql`(posts.bedrock_nova_multimodal_v1_embedding <=> `
      .append(`${embeddingCteAlias}.embedding`)
      .append(sql`) < ${EMBEDDING_DISTANCE_THRESHOLD}`),
  )
}

function appendSimilarPostFilters(filters: SQLStatement[], postId: string): void {
  appendEmbeddingDistance(filters, 'similar_post_embedding')
  filters.push(sql`posts.id != ${postId}`)
  filters.push(sql`NOT EXISTS (
      SELECT 1
      FROM relation__post__related__post
      WHERE (
        (relation__post__related__post.subject_id = ${postId} AND relation__post__related__post.object_id = posts.id)
        OR (relation__post__related__post.subject_id = posts.id AND relation__post__related__post.object_id = ${postId})
      )
      AND relation__post__related__post.deleted_at IS NULL
    )`)
}

function appendSimilarTopicFilters(filters: SQLStatement[], topicId: string): void {
  appendEmbeddingDistance(filters, 'similar_topic_embedding')
  filters.push(
    sql`NOT EXISTS (
      SELECT 1
      FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` AS post_topic_categories
      WHERE post_topic_categories.subject_id = posts.id
        AND post_topic_categories.object_id = ${topicId}
        AND post_topic_categories.deleted_at IS NULL
    )`),
  )
}
