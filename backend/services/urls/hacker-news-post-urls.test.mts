import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import { insertHackerNewsRelatedUrlsForTest } from '@voucha/test-helpers/hacker-news-related-urls'
import { getPostIds } from '../posts/search/get-ids.mts'
import { getPostHackerNewsSummaries } from './hacker-news-sidecars.mts'
import { getHackerNewsUrlIdsByPostIds } from './hacker-news-post-urls.mts'
import { HACKER_NEWS_RELATED_URLS_PER_POST_MAX } from './hacker-news-references-types.mts'

describe('Hacker News post URL selection', () => {
  it('caps each post by best vote score while rejecting nonpositive and deleted relations', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const otherPost = await createTestPost({ user })
    const urls = await Promise.all(Array.from({ length: 15 }, () => createTestUrlWithHostname()))
    const best = urls.slice(0, HACKER_NEWS_RELATED_URLS_PER_POST_MAX)
    await insertHackerNewsRelatedUrlsForTest(post.id, user!.id, [
      ...best.map((urlId, index) => ({ urlId, up: 20 + index })),
      // Net 101 beats every selected net score, but its Wilson rank is far below the best.
      { urlId: urls[10]!, up: 1101, down: 1000 },
      { urlId: urls[11]!, up: 1 },
      { urlId: urls[12]!, up: 2000, down: 2000 },
      { urlId: urls[13]!, up: 1000, deleted: true },
    ])
    await insertHackerNewsRelatedUrlsForTest(otherPost.id, user!.id, [{ urlId: urls[14]!, up: 5 }])
    const selected = await getHackerNewsUrlIdsByPostIds([post.id, otherPost.id, post.id])
    expect(selected[post.id]).toEqual(best.toReversed())
    expect(selected[otherPost.id]).toEqual([urls[14]])
    await insertHackerNewsReferencesForTest({ url_id: urls[10]!, story_count: 1, comment_count: 0 })
    const filtered = await getPostIds(undefined, {
      user_id: user!.id,
      time_range: 'all',
      has_hacker_news_references: true,
    })
    expect(filtered.results.map(row => row.id)).toContain(post.id)
    expect((await getPostHackerNewsSummaries([post.id]))[post.id]).toBeUndefined()
  })

  it('keeps the link URL first and deduplicates it against related URLs', async () => {
    const user = await createTestUser()
    const own = await createTestUrlWithHostname()
    const related = await createTestUrlWithHostname()
    const post = await createTestPost({ user, url_id: own, post_type: 'link' })
    await insertHackerNewsRelatedUrlsForTest(post.id, user!.id, [
      { urlId: own, up: 30 },
      { urlId: related, up: 40 },
    ])
    expect(await getHackerNewsUrlIdsByPostIds([post.id])).toEqual({ [post.id]: [own, related] })
  })
})
