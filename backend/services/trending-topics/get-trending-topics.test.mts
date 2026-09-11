import { describe, it, expect, beforeAll } from 'vitest'
import { getTrendingTopics } from './get-trending-topics.mts'
import { createTrendingTopicData } from '@voucha/test-helpers/entities/trending-topics'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

describe('getTrendingTopics - with test data', () => {
  it('should calculate trending score correctly', async () => {
    const { topicId } = await createTrendingTopicData({
      postTagCount: 200,
      rssItemTagCount: 30,
      netVote: 1,
    })

    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: 100,
      minScore: 1000,
    })

    const found = result.results.find(r => r.id === topicId)
    expect(found).toBeDefined()
    expect(found?.trending_score).toBe(1030) // 200*5 + 30*1
    expect(found?.post_tag_count).toBe(200)
    expect(found?.rss_item_tag_count).toBe(30)
  })
})

describe('getTrendingTopics - time range filtering', () => {
  it('should only include tags from last 24 hours for day range', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000)

    // Create old + recent data in parallel
    const [oldData, recentData] = await Promise.all([
      createTrendingTopicData({
        postTagCount: 5,
        rssItemTagCount: 0,
        netVote: 1,
        createdAt: twoDaysAgo,
      }),
      createTrendingTopicData({
        postTagCount: 200,
        rssItemTagCount: 0,
        netVote: 1,
        createdAt: recent,
      }),
    ])

    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: 100,
      minScore: 900,
    })

    const oldTopic = result.results.find(r => r.id === oldData.topicId)
    const recentTopic = result.results.find(r => r.id === recentData.topicId)

    expect(oldTopic).toBeUndefined()
    expect(recentTopic).toBeDefined()
    expect(recentTopic?.id).toBe(recentData.topicId)
    expect(recentTopic?.trending_score).toBe(1000)
  })

  it('should include tags from last 7 days for week range', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)

    const { topicId } = await createTrendingTopicData({
      postTagCount: 200,
      rssItemTagCount: 0,
      netVote: 1,
      createdAt: sixDaysAgo,
    })

    const result = await getTrendingTopics({
      timeRange: 'week',
      limit: 100,
      minScore: 900,
    })

    const found = result.results.find(r => r.id === topicId)
    expect(found).toBeDefined()
    expect(found?.trending_score).toBe(1000)
  })
})

describe('getTrendingTopics - net vote filtering', () => {
  let positiveTopicId: string
  let zeroTopicId: string
  let negativeTopicId: string

  beforeAll(async () => {
    // Create all three datasets in parallel.
    // Zero/negative vote topics only need a few posts since they'll be filtered out.
    const [positiveData, zeroData, negativeData] = await Promise.all([
      createTrendingTopicData({
        postTagCount: 200,
        rssItemTagCount: 0,
        netVote: 1,
      }),
      createTrendingTopicData({
        postTagCount: 5,
        rssItemTagCount: 0,
        netVote: 0,
      }),
      createTrendingTopicData({
        postTagCount: 5,
        rssItemTagCount: 0,
        netVote: -1,
      }),
    ])
    positiveTopicId = positiveData.topicId
    zeroTopicId = zeroData.topicId
    negativeTopicId = negativeData.topicId
  })

  it('should only include tags with net vote > 0', async () => {
    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: 100,
      minScore: 900,
    })

    const ids = result.results.map(r => r.id)
    expect(ids).toContain(positiveTopicId)
    expect(ids).not.toContain(zeroTopicId)
    expect(ids).not.toContain(negativeTopicId)
  })
})

describe('getTrendingTopics - min score threshold', () => {
  it('should filter topics by minimum score', async () => {
    const [highScoreData, lowScoreData] = await Promise.all([
      createTrendingTopicData({
        postTagCount: 200, // score = 1000
        rssItemTagCount: 0,
        netVote: 1,
      }),
      createTrendingTopicData({
        postTagCount: 10, // score = 50
        rssItemTagCount: 0,
        netVote: 1,
      }),
    ])

    const result = await getTrendingTopics({
      timeRange: 'day',
      minScore: 900,
      limit: 100,
    })

    const ids = result.results.map(r => r.id)
    expect(ids).toContain(highScoreData.topicId)
    expect(ids).not.toContain(lowScoreData.topicId)
  })
})

describe('getTrendingTopics - limit clamping', () => {
  it('should clamp limit 0 to 1', async () => {
    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: 0,
    })

    expect(result.results.length).toBeLessThanOrEqual(1)
    expect(result.page_info).toBeDefined()
  })

  it('should clamp negative limit to 1', async () => {
    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: -10,
    })

    expect(result.results.length).toBeLessThanOrEqual(1)
  })

  it('should clamp limit above 100 to 100', async () => {
    const result = await getTrendingTopics({
      timeRange: 'day',
      limit: 999,
    })

    expect(result.results.length).toBeLessThanOrEqual(100)
  })
})

describe('getTrendingTopics - merged topic filter', () => {
  it('excludes merged topics from trending results', async () => {
    const { topicId: sourceId } = await createTrendingTopicData({
      postTagCount: 200,
      rssItemTagCount: 0,
      netVote: 1,
    })
    const admin = await createTestUser({ administrator: true })
    const destinationTopic = await createTestTopic({ user: admin })

    const fullSource = await getTopicByAny(sourceId)
    const fullDestination = await getTopicByAny(destinationTopic.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    const result = await getTrendingTopics({ timeRange: 'day', limit: 100, minScore: 900 })
    const ids = result.results.map(r => r.id)
    expect(ids).not.toContain(sourceId)
  })
})

describe('getTrendingTopics - pagination', () => {
  it('should paginate results correctly', async () => {
    const expectedTopicIds: string[] = []
    const postTagCounts = [300, 250, 200]

    // Create topics with different scores in parallel
    const datasets = await Promise.all(
      postTagCounts.map(postTagCount =>
        createTrendingTopicData({
          postTagCount,
          rssItemTagCount: 0,
          netVote: 1,
        }),
      ),
    )
    for (const data of datasets) {
      expectedTopicIds.push(data.topicId)
    }

    // Our topics have scores 1500, 1250, 1000 (postTagCount * 5).
    // Use a high minScore to filter out accumulated topics from prior test runs.
    const minScore = 900

    // Verify cursor-based pagination works: page1 and page2 are non-overlapping.
    const page1 = await getTrendingTopics({
      timeRange: 'day',
      limit: 2,
      minScore,
    })

    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()

    const page2 = await getTrendingTopics({
      timeRange: 'day',
      limit: 2,
      after: page1.page_info.end_cursor!,
      minScore,
    })

    expect(page2.results.length).toBeGreaterThanOrEqual(1)

    const page1Ids = new Set(page1.results.map(r => r.id))
    for (const r of page2.results) {
      expect(page1Ids.has(r.id)).toBe(false)
    }

    // Separately verify our 3 topics appear in the full result set (max limit = 100)
    // and are in score-descending order relative to each other.
    const fullResult = await getTrendingTopics({
      timeRange: 'day',
      limit: 100,
      minScore,
    })
    const allIds = fullResult.results.map(r => r.id)
    for (const id of expectedTopicIds) {
      expect(allIds).toContain(id)
    }
    const positions = expectedTopicIds.map(id => allIds.indexOf(id))
    expect(positions[0]).toBeLessThan(positions[1])
    expect(positions[1]).toBeLessThan(positions[2])
  }, 60_000)
})
