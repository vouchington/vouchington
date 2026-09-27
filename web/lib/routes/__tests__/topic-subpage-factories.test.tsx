import {
  mockGetDefaultTopicSubpage,
  mockRedirect,
} from '@/test-helpers/lib/routes/topic-subpage-factories.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { createTopicLayout } from '../topic-layout-factory'

import { createTopicRootPage, createTopicPostsPage } from '../topic-subpage-factories'

import { getTopic } from '@/lib/api/server'

const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Test Topic',
  slug: 'test-topic',
  topic_type: 'topic' as const,
  noindex: false,
  allow_reviews: true,
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

  describe('createTopicLayout', () => {
    it('renders TopicRouteLayout with the closed-over topicType', async () => {
      const Layout = createTopicLayout('topic')
      const result = await Layout({
        params: Promise.resolve({ id: 'topic-1' }),
        children: <span data-testid='child' />,
      })
      render(result)
      expect(screen.getByTestId('child')).toBeDefined()
    })
  })

  describe('createTopicRootPage', () => {
    const { default: RootPage } = createTopicRootPage('topic')

    it('redirects to default subpage when topic is found', async () => {
      mockGetDefaultTopicSubpage.mockReturnValue('posts')

      await expect(RootPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
        'redirect',
      )
      expect(mockRedirect).toHaveBeenCalledWith('/topic/topic-1/posts')
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(RootPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
        'notFound',
      )
    })
  })

  describe('createTopicPostsPage', () => {
    const { default: PostsPage } = createTopicPostsPage('topic')

    it('renders TopicPostsPage when topic exists', async () => {
      const result = await PostsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-posts-page')).toBeDefined()
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(
        PostsPage({
          params: Promise.resolve({ id: 'missing' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('notFound')
    })
  })
})
