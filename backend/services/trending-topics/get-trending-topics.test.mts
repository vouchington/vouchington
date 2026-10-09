import { describe, it, expect } from 'vitest'
import { getTrendingTopics } from './get-trending-topics.mts'
import {
  createTrendingTopicData,
  createTrendingTopicsDataBatch,
} from '@voucha/test-helpers/entities/trending-topics'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'
import { withTestTrendingTopicsWindow } from '@voucha/test-helpers/trending-topics-window'

describe('getTrendingTopics - with test data', () => {
  it('should calculate trending score correctly', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const { topicId } = await createTrendingTopicData({
        postTagCount: 1,
        rssItemTagCount: 1,
        netVote: 1,
        createdAt: recent,
      })
      const foreign = await createTrendingTopicData({
        postTagCount: 1,
        ...eligibleData,
        createdAt: new Date(referenceTime.getTime() - 32 * 24 * 60 * 60 * 1000),
      })
      const globalResult = await getTrendingTopics({ timeRange: 'day', limit: 1 })
      expect(globalResult.results.length).toBeLessThanOrEqual(1)
      expect(globalResult.page_info).toBeDefined()
      const result = await getTrendingTopics(dayOptions)
      const found = result.results.find(r => r.id === topicId)
      expect(found).toBeDefined()
      expect(found?.trending_score).toBe(6)
      expect(found?.post_tag_count).toBe(1)
      expect(found?.rss_item_tag_count).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.results.map(r => r.id)).not.toContain(foreign.topicId)
    })
  })
})
describe('getTrendingTopics - time range filtering', () => {
  it('should only include tags from last 24 hours for day range', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const twoDaysAgo = new Date(referenceTime.getTime() - 48 * 60 * 60 * 1000)
      const [oldData, recentData, futureData] = await createTrendingTopicsDataBatch([
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 1,
          createdAt: twoDaysAgo,
        },
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 1,
          createdAt: recent,
        },
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 1,
          createdAt: new Date(referenceTime.getTime() + 24 * 60 * 60 * 1000),
        },
      ])
      const otherwiseEligible = await getTrendingTopics({
        ...dayOptions,
        timeRange: 'week',
        referenceTime: new Date(referenceTime.getTime() + 48 * 60 * 60 * 1000),
      })
      expect(otherwiseEligible.results.map(r => r.id)).toContain(oldData.topicId)
      expect(otherwiseEligible.results.map(r => r.id)).toContain(futureData.topicId)
      const result = await getTrendingTopics(dayOptions)
      const oldTopic = result.results.find(r => r.id === oldData.topicId)
      const recentTopic = result.results.find(r => r.id === recentData.topicId)
      expect(oldTopic).toBeUndefined()
      expect(result.results.map(r => r.id)).not.toContain(futureData.topicId)
      expect(recentTopic).toBeDefined()
      expect(recentTopic?.id).toBe(recentData.topicId)
      expect(recentTopic?.trending_score).toBe(6)
      expect(result.results).toHaveLength(1)
    })
  })
  it('should include tags from last 7 days for week range', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const sixDaysAgo = new Date(referenceTime.getTime() - 6 * 24 * 60 * 60 * 1000)
      const { topicId } = await createTrendingTopicData({
        postTagCount: 1,
        rssItemTagCount: 1,
        netVote: 1,
        createdAt: sixDaysAgo,
      })
      const result = await getTrendingTopics({
        ...dayOptions,
        timeRange: 'week',
      })
      const found = result.results.find(r => r.id === topicId)
      expect(found).toBeDefined()
      expect(found?.trending_score).toBe(6)
      const outsideDay = await getTrendingTopics(dayOptions)
      expect(outsideDay.results).toEqual([])
    })
  })
})
describe('getTrendingTopics - net vote filtering', () => {
  it('should only include tags with net vote > 0', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const [positiveData, zeroData, negativeData] = await createTrendingTopicsDataBatch([
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 1,
          createdAt: recent,
        },
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 0,
          createdAt: recent,
        },
        {
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: -1,
          createdAt: recent,
        },
      ])
      const positiveTopicId = positiveData.topicId
      const zeroTopicId = zeroData.topicId
      const negativeTopicId = negativeData.topicId
      const result = await getTrendingTopics(dayOptions)
      const ids = result.results.map(r => r.id)
      expect(ids).toContain(positiveTopicId)
      expect(ids).not.toContain(zeroTopicId)
      expect(ids).not.toContain(negativeTopicId)
      expect(ids).toHaveLength(1)
    })
  })
})
describe('getTrendingTopics - min score threshold', () => {
  it('should filter topics by minimum score', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const [highScoreData, lowScoreData] = await createTrendingTopicsDataBatch([
        {
          postTagCount: 2,
          ...eligibleData,
        },
        {
          postTagCount: 1,
          ...eligibleData,
        },
      ])
      const otherwiseEligible = await getTrendingTopics({
        ...dayOptions,
        minScore: 5,
      })
      expect(otherwiseEligible.results.map(r => r.id)).toContain(lowScoreData.topicId)
      const result = await getTrendingTopics({
        ...dayOptions,
        minScore: 6,
      })
      const ids = result.results.map(r => r.id)
      expect(ids).toContain(highScoreData.topicId)
      expect(ids).not.toContain(lowScoreData.topicId)
      expect(ids).toHaveLength(1)
    })
  })
})
describe('getTrendingTopics - limit clamping', () => {
  it('should clamp limit 0 to 1', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const { topicId } = await createTrendingTopicData({ postTagCount: 1, ...eligibleData })
      const result = await getTrendingTopics({ ...dayOptions, limit: 0 })
      expect(result.results.length).toBeLessThanOrEqual(1)
      expect(result.page_info).toBeDefined()
      expect(result.results.map(r => r.id)).toEqual([topicId])
    })
  })
  it('should clamp negative limit to 1', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const { topicId } = await createTrendingTopicData({ postTagCount: 1, ...eligibleData })
      const result = await getTrendingTopics({
        ...dayOptions,
        limit: -10,
      })
      expect(result.results.length).toBeLessThanOrEqual(1)
      expect(result.results.map(r => r.id)).toEqual([topicId])
    })
  })
  it('should clamp limit above 100 to 100', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const { topicId, userId } = await createTrendingTopicData({
        postTagCount: 1,
        ...eligibleData,
      })
      const additional = await createTrendingTopicsDataBatch(
        Array.from({ length: 100 }, () => ({ postTagCount: 1, ...eligibleData })),
        userId,
      )
      const topicIds = [topicId, ...additional.map(data => data.topicId)]
      const expectedIds = topicIds.toSorted().toReversed()
      const result = await getTrendingTopics({ ...dayOptions, limit: 999 })
      expect(result.results.length).toBeLessThanOrEqual(100)
      expect(result.results).toHaveLength(100)
      expect(result.results.map(r => r.id)).toEqual(expectedIds.slice(0, 100))
      expect(result.page_info.has_next_page).toBe(true)
      expect(result.page_info.end_cursor).toBeTruthy()
      const finalPage = await getTrendingTopics({
        ...dayOptions,
        limit: 999,
        after: result.page_info.end_cursor!,
      })
      expect(finalPage.results.map(r => r.id)).toEqual(expectedIds.slice(100))
      expect(finalPage.page_info.has_next_page).toBe(false)
      expect(finalPage.page_info.end_cursor).toBeNull()
    })
  }, 30_000)
})
describe('getTrendingTopics - merged topic filter', () => {
  it('excludes merged topics from trending results', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const { topicId: sourceId } = await createTrendingTopicData({
        postTagCount: 2,
        ...eligibleData,
      })
      const admin = await createTestUser({ administrator: true })
      const destinationTopic = await createTestTopic({ user: admin })
      const fullSource = await getTopicByAny(sourceId)
      const fullDestination = await getTopicByAny(destinationTopic.id)
      if (!fullSource || !fullDestination) throw new Error('Test topics not found')
      const before = await getTrendingTopics(dayOptions)
      expect(before.results.map(r => r.id)).toContain(sourceId)
      await mergeTopicAliases(admin, fullSource, fullDestination)
      const result = await getTrendingTopics(dayOptions)
      const ids = result.results.map(r => r.id)
      expect(ids).not.toContain(sourceId)
    })
  })
})
describe('getTrendingTopics - pagination', () => {
  it('should paginate results correctly', async () => {
    await withTestTrendingTopicsWindow(async referenceTime => {
      const recent = new Date(referenceTime.getTime() - 60 * 60 * 1000)
      const dayOptions = { timeRange: 'day' as const, limit: 100, minScore: 0, referenceTime }
      const eligibleData = { rssItemTagCount: 0, netVote: 1, createdAt: recent }
      const expectedTopicIds: string[] = []
      const datasets = await createTrendingTopicsDataBatch(
        [3, 2, 1].map(postTagCount => ({ postTagCount, ...eligibleData })),
      )
      for (const data of datasets) expectedTopicIds.push(data.topicId)
      const minScore = 5
      const paginationOptions = { ...dayOptions, minScore }
      const page1 = await getTrendingTopics({
        ...paginationOptions,
        limit: 2,
      })
      expect(page1.results.length).toBe(2)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toBeTruthy()
      const page2 = await getTrendingTopics({
        ...paginationOptions,
        limit: 2,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBeGreaterThanOrEqual(1)
      const page1Ids = new Set(page1.results.map(r => r.id))
      for (const r of page2.results) expect(page1Ids.has(r.id)).toBe(false)
      const fullResult = await getTrendingTopics(paginationOptions)
      const allIds = fullResult.results.map(r => r.id)
      for (const id of expectedTopicIds) expect(allIds).toContain(id)
      const positions = expectedTopicIds.map(id => allIds.indexOf(id))
      expect(positions[0]).toBeLessThan(positions[1])
      expect(positions[1]).toBeLessThan(positions[2])
      expect(page1.results.map(r => r.id)).toEqual(expectedTopicIds.slice(0, 2))
      expect(page2.results.map(r => r.id)).toEqual(expectedTopicIds.slice(2))
      expect(page2.page_info.has_next_page).toBe(false)
    })
  })
})
