import type { Post } from '@services/posts/types'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { createSingleEmbedding, hasCurrentPostEmbedding } from '@services/bedrock-embeddings'

export const upsertPostEmbedding = async (post: Post) => {
  const { content, content_sha256 } = createPostTextEmbeddingContent(post)

  if (await hasCurrentPostEmbedding(post.id, content_sha256)) {
    return {
      content_sha256,
    }
  }

  await createSingleEmbedding({
    type: 'post',
    id: post.id,
    content,
  })

  return {
    content_sha256,
  }
}
