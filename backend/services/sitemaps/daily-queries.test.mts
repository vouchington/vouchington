import { randomUUID } from 'node:crypto'
import {
  createTestTopic,
  createTestUser,
  insertTestPostReview,
  withDominantPostFixtures,
} from '@voucha/test-helpers'
import { archivePostForTopHashtagTest } from '@voucha/test-helpers/entities/top-hashtags'
import { describe, expect, it } from 'vitest'
import { readPostsForDayPage } from './daily-queries.mts'

function ownedDay(): string {
  const year = 4000 + (Number.parseInt(randomUUID().slice(0, 4), 16) % 5000)
  return `${year}-06-10`
}

describe('daily sitemap pages', () => {
  it('pages only eligible posts from the requested day below the fixed high water', async () => {
    const day = ownedDay()
    await withDominantPostFixtures(
      [12, 13, 14].map(hour => ({
        postType: 'article',
        votesScoreUp: 1,
        createdAt: new Date(`${day}T${hour}:00:00.000Z`),
      })),
      async ids => {
        const author = await createTestUser()
        await archivePostForTopHashtagTest(ids[1]!, author.id)

        const initial = await readPostsForDayPage('article', day, { limit: 1 })
        expect(initial.map(row => row.id)).toEqual([ids[2]])
        const first = await readPostsForDayPage('article', day, { highWaterId: ids[2], limit: 1 })
        expect(first.map(row => row.id)).toEqual([ids[2]])
        const second = await readPostsForDayPage('article', day, {
          highWaterId: ids[2],
          afterId: ids[2],
          limit: 1,
        })
        expect(second.map(row => row.id)).toEqual([ids[0]])
        const bounded = await readPostsForDayPage('article', day, { highWaterId: ids[1], limit: 1 })
        expect(bounded.map(row => row.id)).toEqual([ids[0]])
      },
    )
  })

  it('returns rating freshness for reviews and no rating freshness for articles', async () => {
    const day = ownedDay()
    await withDominantPostFixtures(
      [
        { postType: 'review', votesScoreUp: 1, createdAt: new Date(`${day}T12:00:00.000Z`) },
        { postType: 'article', votesScoreUp: 1, createdAt: new Date(`${day}T13:00:00.000Z`) },
      ],
      async ([reviewId, articleId]) => {
        const author = await createTestUser()
        const topic = await createTestTopic({ user: author })
        await insertTestPostReview(reviewId!, topic.id)

        const reviews = await readPostsForDayPage('review', day, {
          highWaterId: reviewId,
          limit: 1,
        })
        expect(reviews).toEqual([
          expect.objectContaining({ id: reviewId, review_updated_at: expect.any(Date) }),
        ])
        const articles = await readPostsForDayPage('article', day, {
          highWaterId: articleId,
          limit: 1,
        })
        expect(articles).toEqual([
          expect.objectContaining({ id: articleId, review_updated_at: null }),
        ])
      },
    )
  })
})
