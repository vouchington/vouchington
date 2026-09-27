import { mockRedirect } from '@/test-helpers/lib/routes/topic-subpage-factories.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { createTopicDiscussionsPage } from '../topic-navigation-factories'

import { createTopicReferralLinksPage } from '../topic-referral-factories'

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

  describe('createTopicReferralLinksPage', () => {
    const { default: ReferralLinksPage } = createTopicReferralLinksPage('referral-program')

    it('calls notFound when topic has no referral program', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, topic_type: 'topic' as const, referral_program_id: null },
      } as never)

      await expect(
        ReferralLinksPage({ params: Promise.resolve({ id: 'topic-1' }) }),
      ).rejects.toThrow('notFound')
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(
        ReferralLinksPage({ params: Promise.resolve({ id: 'missing' }) }),
      ).rejects.toThrow('notFound')
    })

    it('renders referral links page for a referral_program topic', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, topic_type: 'referral_program' as const },
      } as never)

      const result = await ReferralLinksPage({ params: Promise.resolve({ id: 'topic-1' }) })
      render(result)
      expect(screen.getByText('Referral Links')).toBeDefined()
    })
  })

  describe('createTopicDiscussionsPage', () => {
    const { default: DiscussionsPage } = createTopicDiscussionsPage('topic')

    it('redirects to /posts subpage', async () => {
      await expect(DiscussionsPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
        'redirect',
      )
      expect(mockRedirect).toHaveBeenCalledWith('/topic/topic-1/posts')
    })
  })
})
