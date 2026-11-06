import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { postsWorkConfig } from '../work-limits.mts'
import { getUserPostTypeFacets } from './get-facets.mts'

async function publicReview(author: PrivateUser, slug: string) {
  await insertTestPost({
    createdById: author.id,
    postType: 'review',
    title: slug,
    slug: `${slug}-${randomUUID()}`,
    markdown: `${slug} has enough text for the profile count fixture.`,
  })
}

describe('profile post facet counts', () => {
  it('counts the posts this viewer can see when the total is under the cap', async () => {
    const author = await createTestUser()
    const stranger = await createTestUser()
    await publicReview(author, 'public-review')
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

    expect(anonymous).toEqual({
      counts: { review: 1, discussion: 0, comment: 0 },
      capped: false,
    })
    expect(asAuthor).toEqual({
      counts: { review: 2, discussion: 0, comment: 0 },
      capped: false,
    })
    expect(asStranger).toEqual({
      counts: { review: 2, discussion: 0, comment: 0 },
      capped: false,
    })
  })

  it('stops one shared scan at the cap and marks the count capped', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      profile_post_count_cap: 2,
    })
    try {
      const author = await createTestUser()
      const stranger = await createTestUser()
      await publicReview(author, 'first-review')
      await publicReview(author, 'second-review')
      await publicReview(author, 'third-review')

      const anonymous = await getUserPostTypeFacets(author.id)
      const asAuthor = await getUserPostTypeFacets(author.id, author)
      const asStranger = await getUserPostTypeFacets(author.id, stranger)
      const cappedCounts = {
        counts: { review: 2, discussion: 0, comment: 0 },
        capped: true,
      }

      expect(anonymous).toEqual(cappedCounts)
      expect(asAuthor).toEqual(cappedCounts)
      expect(asStranger).toEqual(cappedCounts)
    } finally {
      restore()
    }
  })
})
