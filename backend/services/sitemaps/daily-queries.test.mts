import { describe, expect, it } from 'vitest'
import { buildPostsForDayQuery, iteratePostsForDay } from './daily-queries.mts'

describe('daily sitemap queries', () => {
  it('creates an async iterable for daily post entries', () => {
    expect(iteratePostsForDay('article', '2026-06-10')[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('excludes archived posts from daily sitemap coverage', () => {
    const query = buildPostsForDayQuery('article', '2026-06-10').text

    expect(query).toContain('p.archived_at IS NULL')
  })

  it('joins review ratings only for review posts', () => {
    const review = buildPostsForDayQuery('review', '2026-06-10').text
    const article = buildPostsForDayQuery('article', '2026-06-10').text

    expect(review).toContain('pr.updated_at AS review_updated_at')
    expect(review).toContain('post_review_topic_ratings')
    expect(article).toContain('NULL::TIMESTAMPTZ AS review_updated_at')
    expect(article).not.toContain('post_review_topic_ratings')
  })
})
