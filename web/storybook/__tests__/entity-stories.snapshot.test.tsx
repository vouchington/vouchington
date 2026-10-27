import { describe, expect, it } from 'vitest'
import * as fixtures from '../entities/entity-fixtures'
import * as recFixtures from '../entities/topics-story-recommendations'

describe('entity Storybook coverage', () => {
  it('keeps shared fixtures populated for list, form, content, and aside variants', () => {
    expect(fixtures.topics).toHaveLength(12)
    expect(fixtures.posts).toHaveLength(7)
    expect(fixtures.publicUsers).toHaveLength(3)
    expect(fixtures.hostnames).toHaveLength(4)
    expect(fixtures.newsItems).toHaveLength(4)
    expect(fixtures.rssFeeds).toHaveLength(4)
    expect(fixtures.landingPageCandidates.reviews.length).toBeGreaterThan(0)
    expect(fixtures.landingPageWithItems.items).toHaveLength(5)
    expect(fixtures.publicLandingPage.landing_page.items).toHaveLength(5)
    expect(fixtures.userMetrics.count.reviews).toBeGreaterThan(0)
    expect(fixtures.communities).toHaveLength(2)
    expect(recFixtures.recommendationPost.topic_recommendation.status).toBe('pending')
    expect(recFixtures.approvedRecommendationPost.topic_recommendation.status).toBe('approved')
    expect(recFixtures.rejectedRecommendationPost.topic_recommendation.status).toBe('rejected')
    expect(recFixtures.recommendationsMultiStatusResponse.results).toHaveLength(3)
  })
})
