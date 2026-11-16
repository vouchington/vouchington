import sql, { type SQLStatement } from 'sql-template-strings'
import { EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function buildSearchAndSimilarityFilters(
  options: PostSearchOptions & {
    hasSemanticSearch: boolean
    hasTextSearch: boolean
  },
): SQLStatement[] {
  return [
    ...(options.hasTextSearch ? [sql`posts.search_vector @@ text_search_tsquery.tsquery`] : []),
    ...(options.hasSemanticSearch ? buildEmbeddingDistance('semantic_search_embedding') : []),
    ...(options.similar_post_id ? buildSimilarPostFilters(options.similar_post_id) : []),
    ...(options.similar_topic_id ? buildSimilarTopicFilters(options.similar_topic_id) : []),
    ...(options.similar_rss_feed_item_id
      ? buildEmbeddingDistance('similar_rss_feed_item_embedding')
      : []),
  ]
}

function buildEmbeddingDistance(embeddingCteAlias: string): SQLStatement[] {
  return [
    sql`posts.bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
    sql`(posts.bedrock_nova_multimodal_v1_embedding <=> `
      .append(`${embeddingCteAlias}.embedding`)
      .append(sql`) < ${EMBEDDING_DISTANCE_THRESHOLD}`),
  ]
}

function buildSimilarPostFilters(postId: string): SQLStatement[] {
  return [
    ...buildEmbeddingDistance('similar_post_embedding'),
    sql`posts.id != ${postId}`,
    sql`NOT EXISTS (
      SELECT 1
      FROM relation__post__related__post
      WHERE (
        (relation__post__related__post.subject_id = ${postId} AND relation__post__related__post.object_id = posts.id)
        OR (relation__post__related__post.subject_id = posts.id AND relation__post__related__post.object_id = ${postId})
      )
      AND relation__post__related__post.deleted_at IS NULL
    )`,
  ]
}

function buildSimilarTopicFilters(topicId: string): SQLStatement[] {
  return [
    ...buildEmbeddingDistance('similar_topic_embedding'),
    sql`NOT EXISTS (
      SELECT 1
      FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` AS post_topic_categories
      WHERE post_topic_categories.subject_id = posts.id
        AND post_topic_categories.object_id = ${topicId}
        AND post_topic_categories.deleted_at IS NULL
    )`),
  ]
}
