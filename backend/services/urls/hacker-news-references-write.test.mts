import { describe, expect, it } from 'vitest'
import {
  createTestUrlWithHostname,
  getHackerNewsRowVersionsForTest,
  hasHackerNewsLookupForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from './hacker-news-references-read.mts'
import { replaceHackerNewsReferences } from './hacker-news-references-write.mts'
import { setCanonicalUrl } from './set-canonical.mts'

const story = (id: number, points = 1) => ({
  hacker_news_item_id: id,
  points,
  reply_count: 2,
  posted_at: '2026-01-02T03:04:05.000Z',
})
const comment = (id: number) => ({
  hacker_news_item_id: id,
  parent_story_item_id: 1,
  posted_at: '2026-01-02T03:04:05.000Z',
})

describe('replaceHackerNewsReferences', () => {
  it('keeps totals beyond the 25-per-kind caps, replaces stale items and records zero hits', async () => {
    const [urlId, emptyId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const stories = Array.from({ length: 51 }, (_, i) => story(i + 1))
    const comments = Array.from({ length: 51 }, (_, i) => comment(i + 1))
    await replaceHackerNewsReferences([
      { urlId, storyCount: 51, commentCount: 51, stories, comments },
      { urlId: emptyId, storyCount: 0, commentCount: 0, stories: [], comments: [] },
    ])
    const totals = await getHackerNewsTotalsByUrlIds([urlId, emptyId])
    expect(totals.get(urlId)).toEqual({ story_count: 51, comment_count: 51 })
    expect(await hasHackerNewsLookupForTest(emptyId)).toBe(true)
    const capped = (await getHackerNewsItemsByUrlIds([urlId])).get(urlId)!
    expect(capped.stories).toHaveLength(25)
    expect(capped.comments).toHaveLength(25)

    const versions = await getHackerNewsRowVersionsForTest(urlId)
    await replaceHackerNewsReferences([
      { urlId, storyCount: 51, commentCount: 51, stories, comments },
    ])
    expect(await getHackerNewsRowVersionsForTest(urlId)).toEqual(versions)

    await replaceHackerNewsReferences([
      { urlId, storyCount: 1, commentCount: 0, stories: [story(2, 9)], comments: [] },
    ])
    const replaced = (await getHackerNewsItemsByUrlIds([urlId])).get(urlId)!
    expect(replaced.stories).toEqual([story(2, 9)])
    expect(replaced.comments).toEqual([])
  })

  it('serializes concurrent refreshes into a complete snapshot', async () => {
    const urlId = await createTestUrlWithHostname()
    await Promise.all([
      replaceHackerNewsReferences([
        { urlId, storyCount: 1, commentCount: 0, stories: [story(101)], comments: [] },
      ]),
      replaceHackerNewsReferences([
        { urlId, storyCount: 0, commentCount: 1, stories: [], comments: [comment(102)] },
      ]),
    ])
    const totals = (await getHackerNewsTotalsByUrlIds([urlId])).get(urlId)!
    const items = (await getHackerNewsItemsByUrlIds([urlId])).get(urlId)!
    expect([items.stories.length, items.comments.length]).toEqual([
      totals.story_count,
      totals.comment_count,
    ])
  })

  it('ignores a URL that became noncanonical before the refresh', async () => {
    const [urlId, canonicalId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await setCanonicalUrl(urlId, canonicalId)
    await replaceHackerNewsReferences([
      { urlId, storyCount: 1, commentCount: 0, stories: [story(1)], comments: [] },
    ])
    expect((await getHackerNewsTotalsByUrlIds([urlId])).has(urlId)).toBe(false)
  })

  it('commits bounded chunks independently', async () => {
    const ids = (
      await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    ).toSorted()
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsWorkConfig, {
      write_batch_size: 1,
    })
    try {
      await expect(
        replaceHackerNewsReferences([
          { urlId: ids[0]!, storyCount: 1, commentCount: 0, stories: [story(1)], comments: [] },
          { urlId: ids[1]!, storyCount: -1, commentCount: 0, stories: [], comments: [] },
        ]),
      ).rejects.toThrow(/story_count|check constraint/)
      expect(await hasHackerNewsLookupForTest(ids[0]!)).toBe(true)
      expect(await hasHackerNewsLookupForTest(ids[1]!)).toBe(false)
    } finally {
      restore()
    }
  })

  it('does not leave references on a URL racing canonicalization', async () => {
    const [urlId, canonicalId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await Promise.all([
      replaceHackerNewsReferences([
        { urlId, storyCount: 1, commentCount: 1, stories: [story(1)], comments: [comment(2)] },
      ]),
      setCanonicalUrl(urlId, canonicalId),
    ])
    expect(await hasHackerNewsLookupForTest(urlId)).toBe(false)
    expect(await getHackerNewsRowVersionsForTest(urlId)).toEqual([])
  })
})
