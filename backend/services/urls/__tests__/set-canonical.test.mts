import { describe, expect, it } from 'vitest'
import {
  createTestUrlWithHostname,
  getTestUrlCanonicalId,
  hasHackerNewsLookupForTest,
  insertHackerNewsReferencesForTest,
} from '@voucha/test-helpers'
import {
  getHackerNewsItemsByUrlIds,
  getHackerNewsTotalsByUrlIds,
} from '../hacker-news-references-read.mts'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
} from '../hacker-news-references-types.mts'
import { CircularCanonicalReferenceError, setCanonicalUrl } from '../set-canonical.mts'

describe('setCanonicalUrl', () => {
  it('sets a simple canonical URL', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    expect(await setCanonicalUrl(urlA, urlB)).toBe(urlB)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlB)
  })

  it('rejects self-reference', async () => {
    const urlA = await createTestUrlWithHostname()
    await expect(setCanonicalUrl(urlA, urlA)).rejects.toThrow('URL cannot be its own canonical')
  })

  it('detects circular references', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await expect(setCanonicalUrl(urlB, urlA)).rejects.toThrow(CircularCanonicalReferenceError)
  })

  it('resolves target chain before setting (A->B where B->C exists → A->C)', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlB, urlC)
    expect(await setCanonicalUrl(urlA, urlB)).toBe(urlC)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlC)
  })

  it('removes a full source reference set and preserves the canonical references', async () => {
    const source = await createTestUrlWithHostname()
    const canonical = await createTestUrlWithHostname()
    const posted_at = '2026-01-01T00:00:00.000Z'
    await insertHackerNewsReferencesForTest({
      url_id: source,
      story_count: 100,
      comment_count: 100,
      stories: Array.from({ length: HACKER_NEWS_STORY_CAP_PER_URL }, (_, index) => ({
        hacker_news_item_id: index + 1,
        points: 10,
        reply_count: 2,
        posted_at,
      })),
      comments: Array.from({ length: HACKER_NEWS_COMMENT_CAP_PER_URL }, (_, index) => ({
        hacker_news_item_id: index + 100,
        parent_story_item_id: 1,
        posted_at,
      })),
    })
    await insertHackerNewsReferencesForTest({
      url_id: canonical,
      story_count: 1,
      comment_count: 0,
      stories: [{ hacker_news_item_id: 501, points: 3, reply_count: 0, posted_at }],
    })

    expect(await setCanonicalUrl(source, canonical)).toBe(canonical)

    const totals = await getHackerNewsTotalsByUrlIds([source, canonical])
    expect(await hasHackerNewsLookupForTest(source)).toBe(false)
    expect(totals.get(canonical)).toEqual({
      canonical_url_id: canonical,
      story_count: 1,
      comment_count: 0,
    })
    expect(totals.get(source)).toEqual(totals.get(canonical))
    const items = await getHackerNewsItemsByUrlIds([source, canonical])
    expect(items.has(source)).toBe(false)
    expect(items.get(canonical)?.stories).toEqual([
      { hacker_news_item_id: 501, points: 3, reply_count: 0, posted_at },
    ])
  })

  it('flattens back-references when new canonical is set (A->B, then B->C → A->C)', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlB, urlC)
    // A should now point to C (flattened)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlC)
  })

  it('flattens multiple back-references', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    const urlD = await createTestUrlWithHostname()
    // A->B, C->B
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlC, urlB)
    // Now B->D — both A and C should flatten to D
    await setCanonicalUrl(urlB, urlD)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlD)
    expect(await getTestUrlCanonicalId(urlC)).toBe(urlD)
  })

  it('detects cycles through chains: A->B, B->C, C->A', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlB, urlC)
    await expect(setCanonicalUrl(urlC, urlA)).rejects.toThrow(CircularCanonicalReferenceError)
  })
})
