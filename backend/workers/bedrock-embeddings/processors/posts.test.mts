import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestPost, makeRandomEmbedding, updatePostEmbeddingData } from '@voucha/test-helpers'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { upsertPostEmbedding } from './posts.mts'

describe('upsertPostEmbedding', () => {
  it('embeds the post from the centralized cache when no current embedding exists', async () => {
    const title = `Bedrock post processor ${randomUUID()}`
    const markdown = 'Post processor body reusing a centralized cached embedding.'
    const post = (await createTestPost({ title, markdown }))!
    const { content_sha256 } = createPostTextEmbeddingContent(post)
    await updatePostEmbeddingData({
      postId: post.id,
      inputSha256: content_sha256,
      embedding: makeRandomEmbedding(),
      tokens: 9,
    })

    const result = await upsertPostEmbedding(post)

    expect(result.content_sha256.equals(content_sha256)).toBe(true)
  })
})
