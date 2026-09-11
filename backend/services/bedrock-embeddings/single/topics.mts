import { read } from '@data-stores/psql'
import { createTopicEmbeddingContent, type Topic } from '@voucha/types/entities/topic'
import { createSingleEmbedding } from './index.mts'
import sql from 'sql-template-strings'

export const upsertTopicEmbedding = async (topic: Topic) => {
  const { content, content_sha256 } = createTopicEmbeddingContent(topic)

  // no-mistakes-disable-next-line postgres-required-predicates: check topic lifecycle status before deciding whether to generate embeddings
  const { rows } = await read<{
    is_inactive: boolean
    has_embedding: boolean
  }>(
    sql`/* upsertTopicEmbedding */ SELECT (deleted_at IS NOT NULL OR merged_into_topic_id IS NOT NULL) AS is_inactive, (bedrock_nova_multimodal_v1_content_sha256 = ${content_sha256} AND bedrock_nova_multimodal_v1_input_sha256 = ${content_sha256} AND bedrock_nova_multimodal_v1_embedding IS NOT NULL AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL) AS has_embedding FROM topics WHERE id = ${topic.id}`,
  )
  const row = rows[0]

  if (!row || row.is_inactive || row.has_embedding) {
    // embedding already exists and is up to date
    return {
      content_sha256,
    }
  }

  await createSingleEmbedding({
    type: 'topic',
    id: topic.id,
    content,
  })

  return {
    content_sha256,
  }
}
