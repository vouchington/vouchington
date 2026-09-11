// createTopicEmbeddingContent relocated to @voucha/types (pure content-hashing helper, no
// service dependencies) so that backend/services/bedrock-embeddings can compute topic embedding
// content without creating a bedrock-embeddings -> topics workspace cycle. Re-exported here for
// call-site stability, and imported locally for use by updateTopicEmbeddingContentHash below.
import { createTopicEmbeddingContent } from '@voucha/types/entities/topic'
import { write } from '@data-stores/psql'
import { getTopicByAny } from './get.mts'

export { createTopicEmbeddingContent }

export const updateTopicEmbeddingContentHash = async (topicId: string) => {
  const topic = await getTopicByAny(topicId)
  if (!topic) return

  const { content_sha256 } = createTopicEmbeddingContent({
    name: topic.name,
    aliases: topic.aliases,
    markdown: topic.markdown,
  })

  await write(
    `/* updateTopicEmbeddingContentHash */
    UPDATE topics
    SET bedrock_nova_multimodal_v1_content_sha256 = $1
    WHERE id = $2
  `,
    [content_sha256, topicId],
  )
}
