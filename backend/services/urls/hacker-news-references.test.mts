import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname, insertHackerNewsReferencesForTest } from '@voucha/test-helpers'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from './hacker-news-references-read.mts'
import {
  getHackerNewsDetailsByEntity,
  getHackerNewsSummariesByEntity,
} from './hacker-news-references.mts'
import {
  HACKER_NEWS_STORY_CAP_PER_URL,
  HACKER_NEWS_URL_BATCH_MAX,
} from './hacker-news-references-types.mts'

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
  it('keeps real totals, caps rows, and reads summaries and details in batches', async () => {
    const [capped, empty, missing] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const manyStories = Array.from({ length: HACKER_NEWS_STORY_CAP_PER_URL + 5 }, (_, i) =>
      story(1000 + i, i),
    )
    await Promise.all([
      insertHackerNewsReferencesForTest({
        url_id: capped,
        story_count: 80,
        comment_count: 2,
        stories: manyStories,
        comments: [comment(5, '2026-02-01T00:00:00.000Z'), comment(6, '2026-03-01T00:00:00.000Z')],
      }),
      insertHackerNewsReferencesForTest({ url_id: empty, story_count: 0, comment_count: 0 }),
    ])

    const summaries = await getHackerNewsSummariesByEntity({
      cappedEntity: [capped],
      emptyEntity: [empty],
      missingEntity: [missing],
    })
    expect(summaries).toEqual({ cappedEntity: { story_count: 80, comment_count: 2 } })

    const details = await getHackerNewsDetailsByEntity({
      cappedEntity: [capped],
      missingEntity: [missing],
    })
    const detail = details.cappedEntity!
    expect(detail.stories).toHaveLength(HACKER_NEWS_STORY_CAP_PER_URL)
    expect(detail.stories[0]?.points).toBeGreaterThan(detail.stories[1]!.points)
    expect(detail.comments.map(c => c.hacker_news_item_id)).toEqual([6, 5])
    expect(details.missingEntity).toBeUndefined()
  })

  it('dedupes items shared by an entity with several URLs', async () => {
    const [first, second] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await Promise.all([
      insertHackerNewsReferencesForTest({
        url_id: first,
        story_count: 2,
        comment_count: 1,
        stories: [story(2), story(3)],
        comments: [comment(7)],
      }),
      insertHackerNewsReferencesForTest({
        url_id: second,
        story_count: 1,
        comment_count: 1,
        stories: [story(3)],
        comments: [comment(7)],
      }),
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

  it('keeps references for URL ids beyond one read chunk', async () => {
    const [early, late] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await Promise.all([
      insertHackerNewsReferencesForTest({
        url_id: early,
        story_count: 1,
        comment_count: 0,
        stories: [story(11)],
      }),
      insertHackerNewsReferencesForTest({
        url_id: late,
        story_count: 2,
        comment_count: 0,
        stories: [story(12), story(13)],
      }),
    ])
    const filler = Array.from({ length: HACKER_NEWS_URL_BATCH_MAX + 5 }, () => randomUUID())
    const entity = { first: [early, ...filler], last: [...filler, late] }

    expect(await getHackerNewsSummariesByEntity(entity)).toEqual({
      first: { story_count: 1, comment_count: 0 },
      last: { story_count: 2, comment_count: 0 },
    })
    const details = await getHackerNewsDetailsByEntity(entity)
    expect(details.last!.stories.map(s => s.hacker_news_item_id).toSorted()).toEqual([12, 13])
  })

  it('reads nothing for empty input', async () => {
    expect(await getHackerNewsSummariesByEntity({})).toEqual({})
    expect((await getHackerNewsItemsByUrlIds([])).size).toBe(0)
  })
})
