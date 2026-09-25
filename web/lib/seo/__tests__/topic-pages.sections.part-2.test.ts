import { defaultTranslator as t } from '@ts-shared/ui-messages/default-translator'
import { describe, it, expect } from 'vitest'

import { createTopicReviewSectionStructuredData } from '../topic-pages'

import type { Topic, TopicMetrics } from '@/types/topics'

const mockTopic: Topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Test Book',
  slug: 'test-book',
  markdown: 'This is a test book about testing.',
  html: '<p>This is a test book about testing.</p>',
  hero_image_id: null,
  logo_image_id: 'image-1',
  rewards_program_id: null,
  referral_program_id: null,
  aliases: ['book'],
  topic_type: 'topic',
  noindex: false,
  allow_reviews: true,
  created_at: '2024-01-01T00:00:00Z',
  created_by: { id: 'user-1', display_name: 'Test User', display_name_url_id: null },
  updated_by: { id: 'user-1', display_name: 'Test User', display_name_url_id: null },
}

describe('createTopicReviewSectionStructuredData', () => {
  it('includes AggregateRating when metrics have ratings', () => {
    const metricsWithRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: {
        count: { '5': 50, '4': 30, '3': 10, '2': 5, '1': 5 },
      },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicReviewSectionStructuredData(
      t,
      mockTopic,
      'books',
      metricsWithRatings,
      'Reviews',
      ['books'],
    )

    expect(result.topic.aggregateRating).toBeDefined()
    const rating = result.topic.aggregateRating as Record<string, unknown>
    expect(rating['@type']).toBe('AggregateRating')
  })

  it('calculates correct weighted average rating', () => {
    const metricsWithRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: {
        count: { '5': 50, '4': 30, '3': 10, '2': 5, '1': 5 },
      },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicReviewSectionStructuredData(
      t,
      mockTopic,
      'books',
      metricsWithRatings,
      'Reviews',
      ['books'],
    )

    const rating = result.topic.aggregateRating as Record<string, unknown>
    expect(typeof rating.ratingValue).toBe('number')
    expect(rating.ratingCount).toBe(100)
  })

  it('omits AggregateRating when no ratings available', () => {
    const metricsWithoutRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: {
        count: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
      },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicReviewSectionStructuredData(
      t,
      mockTopic,
      'books',
      metricsWithoutRatings,
      'Reviews',
      ['books'],
    )

    expect(result.topic.aggregateRating).toBeUndefined()
    expect(result.topic['@type']).toBe('Book')
  })

  it('omits AggregateRating when metrics is null', () => {
    const result = createTopicReviewSectionStructuredData(t, mockTopic, 'books', null, 'Reviews', [
      'books',
    ])

    expect(result.topic.aggregateRating).toBeUndefined()
  })

  it('uses correct schemaOrgType for software-products', () => {
    const metricsWithRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: {
        count: { '5': 100, '4': 50, '3': 25, '2': 10, '1': 5 },
      },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicReviewSectionStructuredData(
      t,
      { ...mockTopic, name: 'VS Code', slug: 'vs-code' },
      'software-products',
      metricsWithRatings,
      'Reviews',
      ['software-products'],
    )

    expect(result.topic['@type']).toBe('SoftwareApplication')
  })

  it('includes breadcrumb schema for review section', () => {
    const result = createTopicReviewSectionStructuredData(t, mockTopic, 'books', null, 'Reviews', [
      'books',
    ])

    expect(result.breadcrumbs['@type']).toBe('BreadcrumbList')
    expect(Array.isArray(result.breadcrumbs.itemListElement)).toBe(true)
  })

  it('defaults to Thing when categories not provided', () => {
    const metricsWithRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: {
        count: { '5': 10, '4': 5, '3': 2, '2': 1, '1': 2 },
      },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicReviewSectionStructuredData(
      t,
      mockTopic,
      'unknown-type',
      metricsWithRatings,
      'Reviews',
    )

    expect(result.topic['@type']).toBe('Thing')
  })

  it('omits dateModified from review section structured data', () => {
    const result = createTopicReviewSectionStructuredData(t, mockTopic, 'books', null, 'Reviews', [
      'books',
    ])

    expect(result.topic.dateModified).toBeUndefined()
  })
})
