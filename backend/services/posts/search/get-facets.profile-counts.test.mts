import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { observePostgresReadRoutingForTest } from '@voucha/test-helpers/postgres-read-routing'
import type { PrivateUser } from '@services/users/types'
import { getUserPostTypeFacets } from './get-facets.mts'

async function publicPost(
  author: PrivateUser,
  postType: 'review' | 'discussion' | 'comment',
  slug: string,
  parentId?: string,
) {
  return insertTestPost({
    createdById: author.id,
    postType,
    title: slug,
    slug: `${slug}-${randomUUID()}`,
    markdown: `${slug} has enough text for the profile count fixture.`,
    parentId,
    rootId: parentId,
  })
}

describe('profile post facet counts', () => {
  it.each(['replica', 'primary'] as const)('routes profile counts to %s', async route => {
    const author = await createTestUser()
    await publicPost(author, 'review', 'routed-review')

    const routing = await observePostgresReadRoutingForTest()
    try {
      const readCounts = () => getUserPostTypeFacets(author.id, author)
      const counts = await (route === 'primary'
        ? routing.runOnPrimary(readCounts)
        : routing.run(readCounts))
      const [expectedPoolAcquisitions, otherPoolAcquisitions] =
        route === 'primary'
          ? [routing.primaryAcquisitions(), routing.replicaAcquisitions()]
          : [routing.replicaAcquisitions(), routing.primaryAcquisitions()]

      expect(counts).toEqual({ review: 1, discussion: 0, comment: 0 })
      expect(expectedPoolAcquisitions).toBeGreaterThan(0)
      expect(otherPoolAcquisitions).toBe(0)
    } finally {
      await routing.close()
    }
  })

  it('counts the posts this viewer can see', async () => {
    const author = await createTestUser()
    const stranger = await createTestUser()
    await publicPost(author, 'review', 'public-review')
    await insertTestPost({
      createdById: author.id,
      postType: 'review',
      title: 'Private review',
      slug: `private-review-${randomUUID()}`,
      markdown: 'Only logged-in readers can see this private review.',
      privacy: 'private',
      broadcast: 'users',
    })

    const anonymous = await getUserPostTypeFacets(author.id)
    const asAuthor = await getUserPostTypeFacets(author.id, author)
    const asStranger = await getUserPostTypeFacets(author.id, stranger)

    expect(anonymous).toEqual({ review: 1, discussion: 0, comment: 0 })
    expect(asAuthor).toEqual({ review: 2, discussion: 0, comment: 0 })
    expect(asStranger).toEqual({ review: 2, discussion: 0, comment: 0 })
  })

  it('counts each post type on its own, including a review beside several comments', async () => {
    const author = await createTestUser()
    const stranger = await createTestUser()
    const reviewId = await publicPost(author, 'review', 'counted-review')
    await publicPost(author, 'discussion', 'counted-discussion')
    await publicPost(author, 'comment', 'counted-comment-1', reviewId)
    await publicPost(author, 'comment', 'counted-comment-2', reviewId)
    await publicPost(author, 'comment', 'counted-comment-3', reviewId)

    const expected = { review: 1, discussion: 1, comment: 3 }
    expect(await getUserPostTypeFacets(author.id)).toEqual(expected)
    expect(await getUserPostTypeFacets(author.id, author)).toEqual(expected)
    expect(await getUserPostTypeFacets(author.id, stranger)).toEqual(expected)
  })
})
