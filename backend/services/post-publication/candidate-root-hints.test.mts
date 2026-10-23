import { beginTransaction } from '@data-stores/psql'
import { createTestPost, createTestUser, hardDeleteTestPost } from '@voucha/test-helpers'
import { insertTestPostsForUser } from '@voucha/test-helpers/entities/posts-deletion'
import { testPublicationWorkAtPost } from '@voucha/test-helpers/post-publication-fixtures'
import { describe, expect, it } from 'vitest'
import { recordPostPublicationChange } from './capture.mts'
import { readPublicationAncestorRootHints } from './candidate-root-hints.mts'
import { claimPostPublicationDirtyWork } from './dirty-work.mts'
import { readRawPublicationCandidatePage } from './raw-candidate-page.mts'

describe('publication ancestor root hints', () => {
  it('keeps the live target root when a retained nonroot post was deleted', async () => {
    const user = await createTestUser()
    const target = await createTestPost({ user })
    const impactedRoot = await createTestPost({ user })
    const impactedPost = await createTestPost({
      user,
      parent_post_id: impactedRoot.id,
      post_type: 'comment',
    })
    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedPostIds: [impactedPost.id],
    })
    await transaction.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(await readPublicationAncestorRootHints(claimed)).toEqual(
      new Set([target.id, impactedRoot.id]),
    )
    expect(
      await readPublicationAncestorRootHints({
        ...claimed,
        generation: String(BigInt(claimed.generation) + 1n),
      }),
    ).toBeNull()
    await hardDeleteTestPost(impactedPost.id)
    expect(await readPublicationAncestorRootHints(claimed)).toEqual(new Set([target.id]))
  })

  it('falls back to the exact walk when retained post impacts exceed the hint budget', async () => {
    const user = await createTestUser()
    const target = await createTestPost({ user })
    const retainedRoots = await insertTestPostsForUser(user.id, 100)
    const impactedRoot = await createTestPost({ user })
    const impactedPost = await createTestPost({
      user,
      parent_post_id: impactedRoot.id,
      post_type: 'comment',
    })
    const descendant = await createTestPost({
      user,
      parent_post_id: impactedPost.id,
      post_type: 'comment',
    })
    await using transaction = await beginTransaction()
    const work = await recordPostPublicationChange(transaction, {
      scope: { type: 'post', postId: target.id },
      reason: 'post_updated',
      impactedPostIds: [...retainedRoots, impactedPost.id],
    })
    await transaction.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    expect(await readPublicationAncestorRootHints(claimed)).toBeNull()
    const page = await readRawPublicationCandidatePage(
      testPublicationWorkAtPost(claimed, descendant.id),
      1,
    )
    expect(page.postIds).toEqual([descendant.id])
  })
})
