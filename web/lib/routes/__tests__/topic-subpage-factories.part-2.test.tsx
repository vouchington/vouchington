import '@/test-helpers/lib/routes/topic-subpage-factories.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { createTopicReviewsPage, createTopicDataPointsPage } from '../topic-subpage-factories'

import { createTopicLatestPage, createTopicNewsPage } from '../topic-navigation-factories'

import { getTopic } from '@/lib/api/server'

import { createNoIndexMetadata } from '@/lib/seo/metadata'

const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Test Topic',
  slug: 'test-topic',
  topic_type: 'topic' as const,
  is_noindexed: false,
  should_allow_reviews: true,
  markdown: '',
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

const baseTopicData = {
  topic: baseTopic,
  topic_metrics: null,
  topic_categories: [],
  html: null,
  topic_content_update: null,
}

describe('topic factory functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTopic).mockResolvedValue(baseTopicData as never)
  })

  describe('createTopicReviewsPage', () => {
    const { default: ReviewsPage, generateMetadata } = createTopicReviewsPage('topic')

    it('renders TopicReviewsPage when topic allows reviews', async () => {
      const result = await ReviewsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-reviews-page')).toBeDefined()
    })

    it('calls notFound when reviews are not allowed', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, should_allow_reviews: false },
      } as never)

      await expect(
        ReviewsPage({
          params: Promise.resolve({ id: 'topic-1' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('notFound')
    })

    it('returns noindex metadata when reviews are not allowed', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, should_allow_reviews: false },
      } as never)

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalled()
      expect(metadata).toEqual({ noIndex: true })
    })

    // noindex is applied centrally in createTopicSectionMetadata (mocked here);
    // see web/lib/seo/__tests__/topic-pages.test.ts for that coverage.

    it('returns section metadata when the topic is indexable and reviewable', async () => {
      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).not.toHaveBeenCalled()
      expect(metadata).toEqual({})
    })
  })

  describe('createTopicDataPointsPage', () => {
    const { default: DataPointsPage } = createTopicDataPointsPage('topic')

    it('renders TopicDataPointsPage when topic exists', async () => {
      const result = await DataPointsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-data-points-page')).toBeDefined()
    })
  })

  describe('createTopicLatestPage', () => {
    const { default: LatestPage } = createTopicLatestPage('topic')

    it('renders TopicLatestPage when topic exists', async () => {
      const result = await LatestPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-latest-page')).toBeDefined()
    })
  })

  describe('createTopicNewsPage', () => {
    const { default: NewsPage } = createTopicNewsPage('topic')

    it('renders TopicNewsPage when topic exists', async () => {
      const result = await NewsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-news-page')).toBeDefined()
    })
  })
})
