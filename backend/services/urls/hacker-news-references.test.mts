import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  hackerNewsReferenceConfig,
  getHackerNewsReferenceLimit,
} from './hacker-news-reference-limits.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUrlWithHostname, insertHackerNewsReferencesForTest } from '@voucha/test-helpers'
import { setCanonicalUrl } from './set-canonical.mts'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from './hacker-news-references-read.mts'
import {
  getHackerNewsDetailsByEntity,
  getHackerNewsSummariesByEntity,
} from './hacker-news-references.mts'

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
  it('applies lowered row caps to each existing URL without dropping later URLs or comments', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(hackerNewsReferenceConfig, {
        stories_per_url: 2,
        comments_per_url: 1,
        url_batch_size: 1,
      }),
    )
    const ids = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    await Promise.all(
      ids.map(url_id =>
        insertHackerNewsReferencesForTest({
          url_id,
          story_count: 4,
          comment_count: 2,
          stories: [story(1, 1), story(2, 2), story(3, 3), story(4, 4)],
          comments: [comment(5), comment(6, '2026-03-01T00:00:00.000Z')],
        }),
      ),
    )
    const items = await getHackerNewsItemsByUrlIds(ids)
    for (const id of ids) {
      expect(items.get(id)?.stories.map(row => row.hacker_news_item_id)).toEqual([4, 3])
      expect(items.get(id)?.comments.map(row => row.hacker_news_item_id)).toEqual([6])
    }
  })
  it('keeps real totals, caps rows, and reads summaries and details in batches', async () => {
    const [capped, empty, missing] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const manyStories = Array.from(
      { length: getHackerNewsReferenceLimit('stories_per_url') + 5 },
      (_, i) => story(1000 + i, i),
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
    expect(detail.stories).toHaveLength(getHackerNewsReferenceLimit('stories_per_url'))
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
        .toSorted((a, b) => a - b),
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
    const filler = Array.from({ length: getHackerNewsReferenceLimit('url_batch_size') + 5 }, () =>
      randomUUID(),
    )
    const entity = { first: [early, ...filler], last: [...filler, late] }

    expect(await getHackerNewsSummariesByEntity(entity)).toEqual({
      first: { story_count: 1, comment_count: 0 },
      last: { story_count: 2, comment_count: 0 },
    })
    const details = await getHackerNewsDetailsByEntity(entity)
    expect(details.last!.stories.map(s => s.hacker_news_item_id).toSorted((a, b) => a - b)).toEqual(
      [12, 13],
    )
  })

  it('counts a canonical row once when an entity has several URLs resolving to it', async () => {
    const [canonical, aliasA, aliasB] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await insertHackerNewsReferencesForTest({
      url_id: canonical,
      story_count: 3,
      comment_count: 0,
      stories: [story(21), story(22), story(23)],
    })
    await Promise.all([setCanonicalUrl(aliasA, canonical), setCanonicalUrl(aliasB, canonical)])

    const entity = { post: [aliasA, aliasB, canonical] }
    expect(await getHackerNewsSummariesByEntity(entity)).toEqual({
      post: { story_count: 3, comment_count: 0 },
    })
    expect(
      (await getHackerNewsTotalsByUrlIds([aliasA, aliasB])).get(aliasA)?.canonical_url_id,
    ).toBe(canonical)
  })

  it('reads nothing for empty input', async () => {
    expect(await getHackerNewsSummariesByEntity({})).toEqual({})
    expect((await getHackerNewsItemsByUrlIds([])).size).toBe(0)
  })
})
