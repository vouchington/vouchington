import { randomUUID } from 'node:crypto'
import {
  createTestTopic,
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  setPostVotesScoreUp,
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
    const author = await createTestUser()
    const ids: string[] = []
    for (const hour of [12, 13, 14]) {
      const id = await insertTestPost({
        title: 'Sitemap article',
        slug: `sitemap-article-${randomUUID()}`,
        markdown: 'Article body',
        createdById: author.id,
        postType: 'article',
        createdAt: new Date(`${day}T${hour}:00:00.000Z`),
      })
      await setPostVotesScoreUp(id, 1)
      ids.push(id)
    }
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
  })

  it('returns rating freshness for reviews and no rating freshness for articles', async () => {
    const day = ownedDay()
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const reviewId = await insertTestPost({
      title: 'Sitemap review',
      slug: `sitemap-review-${randomUUID()}`,
      markdown: 'Review body',
      createdById: author.id,
      postType: 'review',
      createdAt: new Date(`${day}T12:00:00.000Z`),
    })
    await setPostVotesScoreUp(reviewId, 1)
    await insertTestPostReview(reviewId, topic.id)
    const articleId = await insertTestPost({
      title: 'Sitemap article',
      slug: `sitemap-article-${randomUUID()}`,
      markdown: 'Article body',
      createdById: author.id,
      postType: 'article',
      createdAt: new Date(`${day}T13:00:00.000Z`),
    })
    await setPostVotesScoreUp(articleId, 1)

    const reviews = await readPostsForDayPage('review', day, { highWaterId: reviewId, limit: 1 })
    expect(reviews).toEqual([
      expect.objectContaining({ id: reviewId, review_updated_at: expect.any(Date) }),
    ])
    const articles = await readPostsForDayPage('article', day, { highWaterId: articleId, limit: 1 })
    expect(articles).toEqual([expect.objectContaining({ id: articleId, review_updated_at: null })])
  })
})
