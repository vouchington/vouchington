import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname } from '@voucha/test-helpers'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from './hacker-news-references-read.mts'
import {
  getHackerNewsDetailForUrlIds,
  getHackerNewsDetailsByEntity,
  getHackerNewsSummariesByEntity,
} from './hacker-news-references.mts'
import { replaceHackerNewsReferences } from './hacker-news-references-write.mts'
import { HACKER_NEWS_STORY_CAP_PER_URL } from './hacker-news-references-types.mts'

const story = (id: number, points = 10) => ({
  hacker_news_item_id: id,
  points,
  reply_count: 4,
  posted_at: '2026-01-02T03:04:05.000Z',
})
const comment = (id: number, postedAt = '2026-02-01T00:00:00.000Z') => ({
  hacker_news_item_id: id,
  parent_story_item_id: 900,
  posted_at: postedAt,
})

describe('Hacker News references', () => {
  it('stores capped rows, keeps real totals, and reads summaries and details in batches', async () => {
    const [capped, empty, missing] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const manyStories = Array.from({ length: HACKER_NEWS_STORY_CAP_PER_URL + 5 }, (_, i) =>
      story(1000 + i, i),
    )
    await replaceHackerNewsReferences([
      {
        url_id: capped,
        story_count: 80,
        comment_count: 2,
        stories: manyStories,
        comments: [comment(5, '2026-02-01T00:00:00.000Z'), comment(6, '2026-03-01T00:00:00.000Z')],
      },
      { url_id: empty, story_count: 0, comment_count: 0, stories: [], comments: [] },
    ])

    const summaries = await getHackerNewsSummariesByEntity({
      cappedEntity: [capped],
      emptyEntity: [empty],
      missingEntity: [missing],
    })
    expect(summaries).toEqual({ cappedEntity: { story_count: 80, comment_count: 2 } })

    const details = await getHackerNewsDetailsByEntity({ cappedEntity: [capped] })
    const detail = details.cappedEntity!
    expect(detail.stories).toHaveLength(HACKER_NEWS_STORY_CAP_PER_URL)
    expect(detail.stories[0]?.points).toBeGreaterThan(detail.stories[1]!.points)
    expect(detail.comments.map(c => c.hacker_news_item_id)).toEqual([6, 5])
    expect(await getHackerNewsDetailForUrlIds([missing])).toBeNull()
    expect(await getHackerNewsDetailForUrlIds([capped])).toEqual(detail)
  })

  it('replaces earlier rows and dedupes items shared by an entity with several URLs', async () => {
    const [first, second] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await replaceHackerNewsReferences([
      { url_id: first, story_count: 1, comment_count: 0, stories: [story(1)], comments: [] },
    ])
    await replaceHackerNewsReferences([
      {
        url_id: first,
        story_count: 2,
        comment_count: 1,
        stories: [story(2), story(3)],
        comments: [comment(7)],
      },
      {
        url_id: second,
        story_count: 1,
        comment_count: 1,
        stories: [story(3)],
        comments: [comment(7)],
      },
    ])

    const items = await getHackerNewsItemsByUrlIds([first])
    expect(
      items
        .get(first)
        ?.stories.map(s => s.hacker_news_item_id)
        .toSorted(),
    ).toEqual([2, 3])

    const entity = { post: [first, second, first] }
    expect(await getHackerNewsSummariesByEntity(entity)).toEqual({
      post: { story_count: 2, comment_count: 1 },
    })
    const detail = (await getHackerNewsDetailsByEntity(entity)).post!
    expect(detail.stories.map(s => s.hacker_news_item_id)).toEqual([3, 2])
    expect(detail.comments).toHaveLength(1)
    expect((await getHackerNewsTotalsByUrlIds([first, second])).size).toBe(2)
  })

  it('rejects oversized and duplicate writes and ignores empty batches', async () => {
    const url = await createTestUrlWithHostname()
    const result = { url_id: url, story_count: 0, comment_count: 0, stories: [], comments: [] }
    await expect(replaceHackerNewsReferences([])).resolves.toBeUndefined()
    await expect(replaceHackerNewsReferences([result, result])).rejects.toThrow('duplicate')
    await expect(
      replaceHackerNewsReferences(Array.from({ length: 201 }, () => result)),
    ).rejects.toThrow('At most')
    expect(await getHackerNewsSummariesByEntity({})).toEqual({})
    expect((await getHackerNewsItemsByUrlIds([])).size).toBe(0)
  })
})
