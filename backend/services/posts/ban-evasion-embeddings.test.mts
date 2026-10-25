import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { beginTransaction, setPostEmbeddingContentOnlySha256 } from '@voucha/test-helpers'
import { getPostEmbeddingData } from '@voucha/test-helpers/entities/posts-embeddings'
import {
  anonymizeTestAuthorPostBatch,
  createTestBanEvasionEmbeddingChain,
  deleteTestPostAfterBanEvasionMarkerWait,
} from '@voucha/test-helpers/post-ban-evasion-embeddings'
import { markSkippedPostBanEvasionEmbeddings } from './ban-evasion-embeddings.mts'
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
