import { defaultTranslator as t } from '@ts-shared/ui-messages/default-translator'
import { describe, it, expect } from 'vitest'

import {
  createTopicSectionMetadata,
  createTopicSectionStructuredData,
  createTopicReviewSectionStructuredData,
} from '../topic-pages'

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

const mockSourceTopic: Topic = {
  ...mockTopic,
  id: 'source-1',
  name: 'Fintech Daily (https://fintech.example/feed/rss)',
  slug: 'fintech-daily',
  topic_type: 'rss_feed',
}

describe('createTopicSectionMetadata', () => {
  it('includes rss alternate link when rssUrl is provided', () => {
    const result = createTopicSectionMetadata(mockTopic, 'books', {
      label: 'Posts',
      path: 'posts',
      rssUrl: '/rss/posts?topics=test-book',
    })

    expect(result.alternates?.types?.['application/rss+xml']).toBe('/rss/posts?topics=test-book')
  })

  it('omits rss alternate link when rssUrl is not provided', () => {
    const result = createTopicSectionMetadata(mockTopic, 'books', {
      label: 'Latest',
      path: 'latest',
    })

    expect(result.alternates?.types?.['application/rss+xml']).toBeUndefined()
  })

  it('sets canonical path for the section', () => {
    const result = createTopicSectionMetadata(mockTopic, 'books', {
      label: 'Posts',
      path: 'posts',
    })

    expect(result.alternates?.canonical).toBe('/books/test-book/posts')
  })

  it('keeps topic listing pages as website metadata without article timestamps', () => {
    const result = createTopicSectionMetadata(mockTopic, 'books', {
      label: 'Posts',
      path: 'posts',
    })

    expect(result.openGraph).toMatchObject({
      type: 'website',
    })
    expect(result.openGraph).not.toHaveProperty('publishedTime')
    expect(result.openGraph).not.toHaveProperty('modifiedTime')
  })

  it('strips feed url from rss_feed topic title', () => {
    const result = createTopicSectionMetadata(mockSourceTopic, 'source', {
      label: 'Posts',
      path: 'posts',
    })

    const title = (result.title as { default?: string })?.default ?? result.title
    expect(String(title)).toContain('Fintech Daily')
    expect(String(title)).not.toContain('fintech.example/feed/rss')
  })
})

describe('createTopicSectionStructuredData', () => {
  it('uses correct schemaOrgType when categories provided', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['books'],
    )

    expect(result.topic['@type']).toBe('Book')
  })

  it('defaults to Thing when categories not provided', () => {
    const result = createTopicSectionStructuredData(t, mockTopic, 'books', {
      label: 'Discussions',
      path: 'discussions',
    })

    expect(result.topic['@type']).toBe('Thing')
  })

  it('uses first matching category type when multiple provided', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['unknown', 'books', 'movies'],
    )

    expect(result.topic['@type']).toBe('Book')
  })

  it('includes breadcrumb schema with correct paths', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['books'],
    )

    expect(result.breadcrumbs['@type']).toBe('BreadcrumbList')
    expect(Array.isArray(result.breadcrumbs.itemListElement)).toBe(true)
  })

  it('generates correct topic name with section label', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Data Points', path: 'data-points' },
      ['books'],
    )

    expect(result.topic.name).toContain('Test Book')
    expect(result.topic.name).toContain('Data Points')
  })

  it('generates paths correctly based on topicTypeSlug', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'movies',
      { label: 'Reviews', path: 'reviews' },
      ['movies'],
    )

    expect(result.topic.url).toBeDefined()
    expect(typeof result.topic.url).toBe('string')
  })

  it('includes AggregateRating when topicMetrics has ratings', () => {
    const metricsWithRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 5, reviews: 10, 'data-points': 0, news: 0, latest: 0 },
      ratings: { count: { '5': 8, '4': 4, '3': 2, '2': 1, '1': 1 } },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 3 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['books'],
      metricsWithRatings,
    )

    expect(result.topic.aggregateRating).toBeDefined()
    const rating = result.topic.aggregateRating as Record<string, unknown>
    expect(rating['@type']).toBe('AggregateRating')
    expect(rating.ratingCount).toBe(16)
    expect(rating.bestRating).toBe(5)
    expect(rating.worstRating).toBe(1)
  })

  it('omits dateModified from topic section structured data', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      {
        label: 'Posts',
        path: 'posts',
      },
      ['books'],
    )

    expect(result.topic.dateModified).toBeUndefined()
  })

  it('omits AggregateRating when topicMetrics is not provided', () => {
    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['books'],
    )

    expect(result.topic.aggregateRating).toBeUndefined()
  })

  it('omits AggregateRating when topicMetrics has zero ratings', () => {
    const metricsNoRatings: TopicMetrics = {
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
      ratings: { count: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 } },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }

    const result = createTopicSectionStructuredData(
      t,
      mockTopic,
      'books',
      { label: 'Discussions', path: 'discussions' },
      ['books'],
      metricsNoRatings,
    )

    expect(result.topic.aggregateRating).toBeUndefined()
  })

  it('strips feed url from rss_feed topic structured data name', () => {
    const result = createTopicSectionStructuredData(t, mockSourceTopic, 'source', {
      label: 'Posts',
      path: 'posts',
    })

    expect(String(result.topic.name)).toContain('Fintech Daily')
    expect(String(result.topic.name)).not.toContain('fintech.example/feed/rss')
  })

  it('strips feed url from rss_feed review structured data name', () => {
    const result = createTopicReviewSectionStructuredData(
      t,
      mockSourceTopic,
      'source',
      null,
      'Reviews',
    )

    expect(String(result.topic.name)).toContain('Fintech Daily')
    expect(String(result.topic.name)).not.toContain('fintech.example/feed/rss')
  })
})
