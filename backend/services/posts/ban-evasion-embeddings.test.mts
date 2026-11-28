import { describe, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  makeRandomEmbedding,
  setPostEmbeddingContentOnlySha256,
} from '@voucha/test-helpers'
import {
  getPostEmbeddingData,
  updatePostEmbeddingData,
} from '@voucha/test-helpers/entities/posts-embeddings'
import {
  anonymizeTestAuthorPostBatch,
  createTestBanEvasionEmbeddingChain,
  deleteTestPostAfterBanEvasionMarkerWait,
} from '@voucha/test-helpers/post-ban-evasion-embeddings'
import {
  markEnqueuedPostBanEvasionEmbeddings,
  markSkippedPostBanEvasionEmbeddings,
} from './ban-evasion-embeddings.mts'
import { deletePost } from './delete.mts'
import { getPostByAny } from './get.mts'

describe('skipped post ban-evasion embeddings', () => {
  it('rearms the surviving successor when the two earlier posts are deleted concurrently', async () => {
    const fixture = await createTestBanEvasionEmbeddingChain()
    await markSkippedPostBanEvasionEmbeddings(fixture.skipped)
    const earlier = await Promise.all(
      [fixture.firstId, fixture.skipped[0]!.id].map(id => getPostByAny(id)),
    )
    await Promise.all(
      earlier.map(post => {
        if (!post) throw new Error('Expected an earlier live post')
        return deletePost(fixture.author, post)
      }),
    )
    await expect(getPostEmbeddingData(fixture.skipped[1]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
  })

  it('rearms only the immediate successor after a concurrent earlier-post deletion', async () => {
    const fixture = await createTestBanEvasionEmbeddingChain()
    await using transaction = await beginTransaction()
    await markSkippedPostBanEvasionEmbeddings(fixture.skipped, { query: transaction })
    await deleteTestPostAfterBanEvasionMarkerWait(transaction, fixture.firstId, () =>
      transaction.commit(),
    )

    await expect(getPostEmbeddingData(fixture.skipped[0]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
    await expect(getPostEmbeddingData(fixture.skipped[1]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: fixture.skipped[1]!.input_sha256,
    })
    await markSkippedPostBanEvasionEmbeddings(fixture.skipped)
    await expect(getPostEmbeddingData(fixture.skipped[0]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
  })

  it('rejects an anchor reassigned by a bounded author-deletion batch', async () => {
    const fixture = await createTestBanEvasionEmbeddingChain()
    await expect(
      anonymizeTestAuthorPostBatch(fixture.author.id, fixture.author.username!),
    ).resolves.toMatchObject({ processed: 1 })
    await markSkippedPostBanEvasionEmbeddings(fixture.skipped)
    await expect(getPostEmbeddingData(fixture.skipped[0]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
  })

  it('keeps a changed input pending while making its unchanged sibling terminal', async () => {
    const fixture = await createTestBanEvasionEmbeddingChain()
    await setPostEmbeddingContentOnlySha256(fixture.skipped[0]!.id, randomBytes(32))
    await markSkippedPostBanEvasionEmbeddings(fixture.skipped)
    await expect(getPostEmbeddingData(fixture.skipped[0]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
    await expect(getPostEmbeddingData(fixture.skipped[1]!.id)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: fixture.skipped[1]!.input_sha256,
    })
  })
})

describe('enqueued post ban-evasion embeddings', () => {
  it('marks only requested posts when multiple posts share the same embedding hash and enforces both hash guards', async () => {
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: author.id, visibility: 'public' })
    const sharedHash = randomBytes(32)
    const embedding = makeRandomEmbedding()
    const createEmbeddedPost = async () => {
      const postId = await insertTestPost({
        title: 'Shared hash ban-evasion post',
        slug: `shared-hash-${randomUUID()}`,
        markdown: 'Shared hash fixture',
        createdById: author.id,
        communityId: community.id,
        postType: 'article',
      })
      await setPostEmbeddingContentOnlySha256(postId, sharedHash)
      await updatePostEmbeddingData({
        postId,
        inputSha256: sharedHash,
        embedding,
        tokens: 1,
      })
      return postId
    }

    const [matchingIdA, matchingIdB, unrequestedSiblingId, staleContentId, staleInputId] =
      await Promise.all([
        createEmbeddedPost(),
        createEmbeddedPost(),
        createEmbeddedPost(),
        createEmbeddedPost(),
        createEmbeddedPost(),
      ])

    await setPostEmbeddingContentOnlySha256(staleContentId, randomBytes(32))
    await updatePostEmbeddingData({
      postId: staleInputId,
      inputSha256: randomBytes(32),
      embedding,
      tokens: 1,
    })

    await markEnqueuedPostBanEvasionEmbeddings([])
    await markEnqueuedPostBanEvasionEmbeddings([
      { post_id: staleInputId, input_sha256: sharedHash },
      { post_id: matchingIdB, input_sha256: sharedHash },
      { post_id: staleContentId, input_sha256: sharedHash },
      { post_id: matchingIdA, input_sha256: sharedHash },
    ])

    await expect(getPostEmbeddingData(matchingIdA)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: sharedHash,
    })
    await expect(getPostEmbeddingData(matchingIdB)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: sharedHash,
    })
    await expect(getPostEmbeddingData(unrequestedSiblingId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
    await expect(getPostEmbeddingData(staleContentId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
    await expect(getPostEmbeddingData(staleInputId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: null,
    })
  })
})
