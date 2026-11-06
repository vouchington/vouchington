import { beforeAll, describe, expect, it } from 'vitest'
import {
  insertTestCardTopicsWithDataPoints,
  type CardTopicDataPointFixture,
  type CardTopicFixture,
} from '@voucha/test-helpers/entities/card-topic-data-points'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postsWorkConfig } from '@services/posts/work-limits'
import { searchDataPoints } from './data-point-page.mts'

const suffix = crypto.randomUUID().slice(0, 8)

const topics: readonly CardTopicFixture[] = [
  { name: `Search DP Topic ${suffix}`, slug: `search-dp-topic-${suffix}` },
  { name: `Other DP Topic ${suffix}`, slug: `other-dp-topic-${suffix}` },
]

// Create a variety of data points for filtering tests
const dataPoints: readonly CardTopicDataPointFixture[] = [
  {
    title: `Approved CC 670-739 ${suffix}`,
    slug: `dp-approved-670-${suffix}`,
    topicIndex: 0,
    vertical: 'credit_card',
    result: 'approved',
    creditScoreRange: '670-739',
    creditLimit: { amount: 1_000_000, currency: 'usd' },
  },
  {
    title: `Denied CC 580-669 ${suffix}`,
    slug: `dp-denied-580-${suffix}`,
    topicIndex: 0,
    vertical: 'credit_card',
    result: 'denied',
    creditScoreRange: '580-669',
  },
  {
    title: `Pending CC 740-799 ${suffix}`,
    slug: `dp-pending-740-${suffix}`,
    topicIndex: 0,
    vertical: 'credit_card',
    result: 'pending',
    creditScoreRange: '740-799',
  },
  {
    title: `Approved BA ${suffix}`,
    slug: `dp-approved-ba-${suffix}`,
    topicIndex: 0,
    vertical: 'bank_account',
    result: 'approved',
  },
  {
    title: `Other Topic DP ${suffix}`,
    slug: `dp-other-topic-${suffix}`,
    topicIndex: 1,
    vertical: 'credit_card',
    result: 'approved',
  },
]

describe('searchDataPoints', () => {
  let topicId: string
  let otherTopicId: string

  beforeAll(async () => {
    const seeded = await insertTestCardTopicsWithDataPoints({ topics, dataPoints })
    topicId = seeded.topicIds[0]
    otherTopicId = seeded.topicIds[1]
  })

  it('returns data points filtered by topic_id', async () => {
    const { results } = await searchDataPoints({ topic_id: topicId })
    expect(results.length).toBeGreaterThanOrEqual(4)
    // Should not include other topic's data points
    const otherTopicResults = results.filter(r =>
      (r.structured_data as { topic_ids?: string[] })?.topic_ids?.includes(otherTopicId),
    )
    expect(otherTopicResults).toHaveLength(0)
  })

  it('returns data points filtered by vertical', async () => {
    const { results } = await searchDataPoints({ topic_id: topicId, vertical: 'bank_account' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.data_point_vertical === 'bank_account')).toBe(true)
  })

  it('returns data points filtered by result', async () => {
    const { results } = await searchDataPoints({ topic_id: topicId, result: 'approved' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.structured_data?.result === 'approved')).toBe(true)
  })

  it('returns data points filtered by credit_score_range', async () => {
    const { results } = await searchDataPoints({
      topic_id: topicId,
      credit_score_range: '670-739',
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.structured_data?.credit_score_range === '670-739')).toBe(true)
  })

  it('combines multiple filters', async () => {
    const { results } = await searchDataPoints({
      topic_id: topicId,
      vertical: 'credit_card',
      result: 'denied',
      credit_score_range: '580-669',
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.data_point_vertical === 'credit_card')).toBe(true)
    expect(results.every(r => r.structured_data?.result === 'denied')).toBe(true)
  })

  it('returns empty array for non-existent topic', async () => {
    const page = await searchDataPoints({
      topic_id: '00000000-0000-7000-8000-000000000001',
    })
    expect(page.results).toEqual([])
  })

  it('respects limit and caps at max 25', async () => {
    const results = await searchDataPoints({ limit: 1 })
    expect(results.results.length).toBeLessThanOrEqual(1)

    const bigResults = await searchDataPoints({ limit: 999 })
    expect(bigResults.results.length).toBeLessThanOrEqual(25)
  })

  it('pages a topic one child at a time without duplicate ids', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      data_point_child_limit: 1,
    })
    try {
      const seen = new Set<string>()
      let after: string | undefined
      for (let pageNumber = 0; pageNumber < 6; pageNumber += 1) {
        const page = await searchDataPoints({ topic_id: topicId, after })
        for (const row of page.results) {
          expect(seen.has(row.id)).toBe(false)
          seen.add(row.id)
        }
        if (!page.page_info.has_next_page) break
        expect(page.page_info.end_cursor).toEqual(expect.any(String))
        after = page.page_info.end_cursor ?? undefined
      }
      expect(seen.size).toBeGreaterThanOrEqual(4)
    } finally {
      restore()
    }
  })

  it('returns required fields on each result', async () => {
    const { results } = await searchDataPoints({ topic_id: topicId, limit: 1 })
    expect(results.length).toBeGreaterThanOrEqual(1)
    const r = results[0]
    expect(r).toHaveProperty('id')
    expect(r).toHaveProperty('title')
    expect(r).toHaveProperty('data_point_vertical')
    expect(r).toHaveProperty('structured_data')
  })
})
